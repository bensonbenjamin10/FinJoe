import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { getTenantId } from "./auth.js";
import { paymentOrders, incomeRecords, incomeCategories, invoices } from "../shared/schema.js";
import { createFinJoeData } from "../lib/finjoe-data.js";
import { createPaymentAllocationService } from "../lib/invoicing/application/payment-allocation-service.js";
import {
  getRazorpayKeyId,
  razorpayConfigured,
  razorpayCreateOrder,
  razorpayFetchPayment,
  verifyRazorpaySignature,
} from "./razorpay-api.js";

function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function resolvePaymentTenantId(req: Request): string | null {
  const user = req.user as Express.User;
  const fromGet = getTenantId(req);
  if (user.role === "super_admin") {
    const bodyTid = req.body?.tenantId;
    if (typeof bodyTid === "string" && bodyTid) return bodyTid;
    return fromGet;
  }
  return user.tenantId ?? null;
}

async function resolveIncomeCategoryId(tenantId: string, requestedId?: string): Promise<string | null> {
  if (requestedId) {
    const [row] = await db
      .select({ id: incomeCategories.id })
      .from(incomeCategories)
      .where(and(eq(incomeCategories.tenantId, tenantId), eq(incomeCategories.id, requestedId), eq(incomeCategories.isActive, true)))
      .limit(1);
    return row?.id ?? null;
  }
  const rows = await db
    .select({ id: incomeCategories.id })
    .from(incomeCategories)
    .where(and(eq(incomeCategories.tenantId, tenantId), eq(incomeCategories.isActive, true)))
    .orderBy(asc(incomeCategories.displayOrder), asc(incomeCategories.name))
    .limit(1);
  return rows[0]?.id ?? null;
}

export function registerPaymentRoutes(app: Express) {
  app.post("/api/payments/create-order", requireLogin, async (req, res) => {
    try {
      if (!razorpayConfigured()) {
        return res.status(503).json({ error: "Payment gateway is not configured (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)" });
      }
      const tenantId = resolvePaymentTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: "tenantId required (super_admin: pass tenantId in body or ?tenantId=)" });
      }
      const { amount, paymentType, metadata, incomeCategoryId, costCenterId, registrationId } = req.body ?? {};
      const amountNum = typeof amount === "number" ? amount : Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0 || !Number.isInteger(Math.round(amountNum))) {
        return res.status(400).json({ error: "amount must be a positive integer (rupees)" });
      }
      const rupees = Math.round(amountNum);
      const categoryId = await resolveIncomeCategoryId(tenantId, typeof incomeCategoryId === "string" ? incomeCategoryId : undefined);
      if (!categoryId) {
        return res.status(400).json({ error: "No active income category for this tenant. Create one under Income settings or pass incomeCategoryId." });
      }
      const meta =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : {};
      const notes: Record<string, string> = {
        tenantId,
        ...(typeof registrationId === "string" && registrationId ? { registrationId } : {}),
        ...(typeof paymentType === "string" && paymentType ? { paymentType } : {}),
      };
      for (const [k, v] of Object.entries(meta)) {
        if (notes[k] !== undefined) continue;
        if (v === null || v === undefined) continue;
        notes[k] = typeof v === "string" ? v : JSON.stringify(v);
      }

      const receipt = `fj_${tenantId.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);
      const { id: razorpayOrderId } = await razorpayCreateOrder({
        amountPaise: rupees * 100,
        receipt,
        notes,
      });

      const ccId =
        typeof costCenterId === "string" && costCenterId && costCenterId !== "__corporate__" && costCenterId !== "null"
          ? costCenterId
          : null;

      await db.insert(paymentOrders).values({
        tenantId,
        amountRupees: rupees,
        currency: "INR",
        razorpayOrderId,
        status: "created",
        paymentType: typeof paymentType === "string" ? paymentType : null,
        incomeCategoryId: categoryId,
        costCenterId: ccId,
        metadata: { ...meta, ...(typeof registrationId === "string" ? { registrationId } : {}) },
      });

      res.status(201).json({ orderId: razorpayOrderId });
    } catch (e) {
      logger.error("create-order error", { requestId: (req as Express.Request & { requestId?: string }).requestId, err: String(e) });
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create order" });
    }
  });

  app.get("/api/payments/order/:orderId", async (req, res) => {
    try {
      if (!razorpayConfigured()) {
        return res.status(503).json({ error: "Payment gateway is not configured" });
      }
      const keyId = getRazorpayKeyId();
      if (!keyId) {
        return res.status(503).json({ error: "Payment gateway is not configured" });
      }
      const orderId = req.params.orderId;
      if (!orderId || typeof orderId !== "string") {
        return res.status(400).json({ error: "Invalid order id" });
      }
      const [row] = await db.select().from(paymentOrders).where(eq(paymentOrders.razorpayOrderId, orderId)).limit(1);
      if (!row) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json({
        orderId: row.razorpayOrderId,
        amount: row.amountRupees,
        currency: row.currency,
        keyId,
      });
    } catch (e) {
      logger.error("payments order fetch error", { requestId: (req as Express.Request & { requestId?: string }).requestId, err: String(e) });
      res.status(500).json({ error: "Failed to load order" });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      if (!razorpayConfigured()) {
        return res.status(503).json({ error: "Payment gateway is not configured" });
      }
      const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body ?? {};
      if (
        typeof razorpayPaymentId !== "string" ||
        typeof razorpayOrderId !== "string" ||
        typeof razorpaySignature !== "string" ||
        !razorpayPaymentId ||
        !razorpayOrderId ||
        !razorpaySignature
      ) {
        return res.status(400).json({ error: "razorpayPaymentId, razorpayOrderId, and razorpaySignature required" });
      }

      if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }

      const [existingIncome] = await db
        .select({ id: incomeRecords.id })
        .from(incomeRecords)
        .where(eq(incomeRecords.razorpayPaymentId, razorpayPaymentId))
        .limit(1);
      if (existingIncome) {
        return res.json({ ok: true, incomeId: existingIncome.id, idempotent: true });
      }

      const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.razorpayOrderId, razorpayOrderId)).limit(1);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status === "paid" && order.incomeRecordId) {
        return res.json({ ok: true, incomeId: order.incomeRecordId, idempotent: true });
      }

      let payment;
      try {
        payment = await razorpayFetchPayment(razorpayPaymentId);
      } catch (e) {
        logger.error("razorpay fetch payment", { err: String(e) });
        return res.status(502).json({ error: "Could not confirm payment with Razorpay" });
      }

      if (payment.status !== "authorized" && payment.status !== "captured") {
        return res.status(400).json({ error: `Payment not successful (status: ${payment.status})` });
      }

      if (payment.order_id && payment.order_id !== razorpayOrderId) {
        return res.status(400).json({ error: "Payment does not match order" });
      }

      const expectedPaise = order.amountRupees * 100;
      if (!Number.isFinite(payment.amount) || payment.amount !== expectedPaise) {
        logger.warn("Razorpay amount mismatch", { expectedPaise, got: payment.amount, orderId: razorpayOrderId });
        return res.status(400).json({ error: "Payment amount does not match order" });
      }

      const today = new Date().toISOString().slice(0, 10);
      const particularsParts = [`Razorpay ${razorpayPaymentId}`];
      if (order.paymentType) particularsParts.push(order.paymentType);
      const particulars = particularsParts.join(" · ");

      try {
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(paymentOrders).where(eq(paymentOrders.razorpayOrderId, razorpayOrderId)).limit(1);
          if (!locked) {
            throw new Error("Order missing");
          }
          const lockedInvoiceId = typeof locked.metadata === "object" && locked.metadata && "invoiceId" in locked.metadata
            ? String((locked.metadata as Record<string, unknown>).invoiceId)
            : null;

          if (locked.status === "paid" && locked.incomeRecordId) {
            return { incomeId: locked.incomeRecordId, idempotent: true as const, invoiceId: lockedInvoiceId, paymentOrderId: locked.id };
          }

          const [dup] = await tx
            .select({ id: incomeRecords.id })
            .from(incomeRecords)
            .where(eq(incomeRecords.razorpayPaymentId, razorpayPaymentId))
            .limit(1);
          if (dup) {
            await tx
              .update(paymentOrders)
              .set({ status: "paid", incomeRecordId: dup.id, updatedAt: new Date() })
              .where(eq(paymentOrders.id, locked.id));
            return { incomeId: dup.id, idempotent: true as const, invoiceId: lockedInvoiceId, paymentOrderId: locked.id };
          }

          const finJoeData = createFinJoeData(tx, locked.tenantId);
          const created = await finJoeData.createIncome({
            tenantId: locked.tenantId,
            costCenterId: locked.costCenterId,
            categoryId: locked.incomeCategoryId,
            amount: locked.amountRupees,
            incomeDate: today,
            particulars,
            incomeType: "other",
            source: "razorpay",
            razorpayPaymentId,
          });
          if (!created?.id) {
            throw new Error("Failed to create income record");
          }
          await tx
            .update(paymentOrders)
            .set({ status: "paid", incomeRecordId: created.id, updatedAt: new Date() })
            .where(eq(paymentOrders.id, locked.id));

          return { incomeId: created.id, idempotent: false as const, invoiceId: lockedInvoiceId, paymentOrderId: locked.id };
        });

        if (result.invoiceId) {
          try {
            const allocSvc = createPaymentAllocationService(db);
            const [inv] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId)).limit(1);
            if (inv) {
              await allocSvc.allocateGatewayPayment({
                tenantId: inv.tenantId,
                invoiceId: result.invoiceId,
                amount: order.amountRupees,
                paymentOrderId: result.paymentOrderId ?? order.id,
                incomeRecordId: result.incomeId,
                provider: "razorpay",
                externalPaymentId: razorpayPaymentId,
              });
            }
          } catch (allocErr) {
            logger.warn("Invoice allocation after verify failed (income posted OK)", { err: String(allocErr) });
          }
        }

        return res.json({ ok: true, incomeId: result.incomeId, idempotent: result.idempotent });
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
          const [row] = await db
            .select({ id: incomeRecords.id })
            .from(incomeRecords)
            .where(eq(incomeRecords.razorpayPaymentId, razorpayPaymentId))
            .limit(1);
          if (row) {
            await db
              .update(paymentOrders)
              .set({ status: "paid", incomeRecordId: row.id, updatedAt: new Date() })
              .where(eq(paymentOrders.razorpayOrderId, razorpayOrderId));
            return res.json({ ok: true, incomeId: row.id, idempotent: true });
          }
        }
        throw e;
      }
    } catch (e) {
      logger.error("payments verify error", { requestId: (req as Express.Request & { requestId?: string }).requestId, err: String(e) });
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });
}
