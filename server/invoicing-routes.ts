import type { Express } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { requireTenantStaff, getTenantId } from "./auth.js";
import { sendFinJoeEmail } from "../worker/src/email.js";
import type { CreateInvoiceLineInput } from "../lib/invoicing/ports/types.js";
import { createInvoiceService } from "../lib/invoicing/application/invoice-service.js";
import { createPaymentAllocationService } from "../lib/invoicing/application/payment-allocation-service.js";
import { createAgingReportService } from "../lib/invoicing/application/aging-report-service.js";
import { HtmlInvoiceDocument } from "../lib/invoicing/infra/html-invoice-document.js";
import { invoices, billingCustomers, incomeCategories, paymentOrders } from "../shared/schema.js";
import {
  razorpayConfigured,
  razorpayCreateOrder,
} from "./razorpay-api.js";

export function registerInvoicingRoutes(app: Express) {
  const invoiceSvc = createInvoiceService(db);
  const allocSvc = createPaymentAllocationService(db);
  const agingSvc = createAgingReportService(db);

  // ── Customers ──

  app.get("/api/admin/invoicing/customers", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const search = typeof req.query?.search === "string" ? req.query.search : undefined;
      const rows = await invoiceSvc.listCustomers(tid, { search });
      res.json(rows);
    } catch (e) {
      logger.error("List customers error", { err: String(e) });
      res.status(500).json({ error: "Failed to list customers" });
    }
  });

  app.post("/api/admin/invoicing/customers", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { name, email, phone, address, gstin } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Customer name is required" });
      const created = await invoiceSvc.createCustomer({ tenantId: tid, name: name.trim(), email, phone, address, gstin });
      res.status(201).json(created);
    } catch (e) {
      logger.error("Create customer error", { err: String(e) });
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.patch("/api/admin/invoicing/customers/:id", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const updated = await invoiceSvc.updateCustomer(tid, req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Customer not found" });
      res.json(updated);
    } catch (e) {
      logger.error("Update customer error", { err: String(e) });
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  // ── Invoices ──

  app.get("/api/admin/invoicing/kpis", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const kpis = await invoiceSvc.getKpis(tid);
      res.json(kpis);
    } catch (e) {
      logger.error("KPIs error", { err: String(e) });
      res.status(500).json({ error: "Failed to fetch KPIs" });
    }
  });

  app.get("/api/admin/invoicing/aging", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const buckets = await agingSvc.getAging(tid);
      res.json(buckets);
    } catch (e) {
      logger.error("Aging report error", { err: String(e) });
      res.status(500).json({ error: "Failed to fetch aging report" });
    }
  });

  app.get("/api/admin/invoicing/invoices", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { status, customerId, startDate, endDate, limit, offset } = req.query as Record<string, string | undefined>;
      const result = await invoiceSvc.listInvoices(tid, {
        status,
        customerId,
        startDate,
        endDate,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      res.json(result);
    } catch (e) {
      logger.error("List invoices error", { err: String(e) });
      res.status(500).json({ error: "Failed to list invoices" });
    }
  });

  app.get("/api/admin/invoicing/invoices/:id", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const inv = await invoiceSvc.getInvoice(tid, req.params.id);
      if (!inv) return res.status(404).json({ error: "Invoice not found" });
      res.json(inv);
    } catch (e) {
      logger.error("Get invoice error", { err: String(e) });
      res.status(500).json({ error: "Failed to fetch invoice" });
    }
  });

  app.post("/api/admin/invoicing/preview-tax", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { customerId, lines, costCenterId, supplierGstinOverride, supplierStateCodeOverride } = req.body ?? {};
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: "At least one line item required" });
      }
      const normalized: CreateInvoiceLineInput[] = [];
      for (const l of lines) {
        if (!l?.description?.trim()) return res.status(400).json({ error: "Line description required" });
        if (typeof l.unitAmount !== "number" || l.unitAmount <= 0) {
          return res.status(400).json({ error: "Line unit amount must be positive" });
        }
        if (typeof l.quantity !== "number" || l.quantity <= 0) {
          return res.status(400).json({ error: "Line quantity must be positive" });
        }
        const taxRate = typeof l.taxRate === "number" && l.taxRate > 0 ? l.taxRate : 0;
        normalized.push({
          description: String(l.description).trim(),
          quantity: l.quantity,
          unitAmount: Math.round(l.unitAmount),
          taxRate: taxRate > 0 ? taxRate : undefined,
          hsnCode: l.hsnCode ? String(l.hsnCode).trim() || null : null,
        });
      }
      const cid = typeof customerId === "string" && customerId ? customerId : null;
      const ccRaw = costCenterId === undefined ? undefined : costCenterId === null || costCenterId === "" || costCenterId === "__corporate__" ? null : String(costCenterId);
      if (supplierGstinOverride != null && supplierGstinOverride !== "") {
        const g = String(supplierGstinOverride).trim().toUpperCase();
        if (!/^[0-9A-Z]{15}$/.test(g)) return res.status(400).json({ error: "supplierGstinOverride must be 15 alphanumeric characters" });
      }
      if (supplierStateCodeOverride != null && supplierStateCodeOverride !== "") {
        const s = String(supplierStateCodeOverride).trim();
        if (!/^\d{2}$/.test(s)) return res.status(400).json({ error: "supplierStateCodeOverride must be a 2-digit state code" });
      }
      const out = await invoiceSvc.previewTax({
        tenantId: tid,
        customerId: cid,
        costCenterId: ccRaw,
        supplierGstinOverride: supplierGstinOverride === undefined ? undefined : supplierGstinOverride === null || supplierGstinOverride === "" ? null : String(supplierGstinOverride).trim().toUpperCase(),
        supplierStateCodeOverride:
          supplierStateCodeOverride === undefined
            ? undefined
            : supplierStateCodeOverride === null || supplierStateCodeOverride === ""
              ? null
              : String(supplierStateCodeOverride).trim(),
        lines: normalized,
      });
      res.json(out);
    } catch (e) {
      logger.error("Preview tax error", { err: String(e) });
      res.status(500).json({ error: "Failed to preview tax" });
    }
  });

  app.post("/api/admin/invoicing/invoices", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { customerId, issueDate, dueDate, notes, costCenterId, incomeCategoryId, lines, supplierGstinOverride, supplierStateCodeOverride } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId required" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: "At least one line item required" });
      for (const l of lines) {
        if (!l.description?.trim()) return res.status(400).json({ error: "Line description required" });
        if (typeof l.unitAmount !== "number" || l.unitAmount <= 0) return res.status(400).json({ error: "Line unit amount must be positive" });
        if (typeof l.quantity !== "number" || l.quantity <= 0) return res.status(400).json({ error: "Line quantity must be positive" });
      }
      if (supplierGstinOverride != null && supplierGstinOverride !== "") {
        const g = String(supplierGstinOverride).trim().toUpperCase();
        if (!/^[0-9A-Z]{15}$/.test(g)) return res.status(400).json({ error: "supplierGstinOverride must be 15 alphanumeric characters" });
      }
      if (supplierStateCodeOverride != null && supplierStateCodeOverride !== "") {
        const s = String(supplierStateCodeOverride).trim();
        if (!/^\d{2}$/.test(s)) return res.status(400).json({ error: "supplierStateCodeOverride must be a 2-digit state code" });
      }
      const inv = await invoiceSvc.createInvoice({
        tenantId: tid,
        customerId,
        issueDate,
        dueDate,
        notes,
        costCenterId,
        incomeCategoryId,
        lines,
        supplierGstinOverride,
        supplierStateCodeOverride,
      });
      res.status(201).json(inv);
    } catch (e) {
      logger.error("Create invoice error", { err: String(e) });
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create invoice" });
    }
  });

  app.patch("/api/admin/invoicing/invoices/:id", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { customerId, issueDate, dueDate, notes, costCenterId, incomeCategoryId, lines, supplierGstinOverride, supplierStateCodeOverride } = req.body;
      if (lines !== undefined) {
        if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: "At least one line item required" });
        for (const l of lines) {
          if (!l.description?.trim()) return res.status(400).json({ error: "Line description required" });
          if (typeof l.unitAmount !== "number" || l.unitAmount <= 0) return res.status(400).json({ error: "Line unit amount must be positive" });
          if (typeof l.quantity !== "number" || l.quantity <= 0) return res.status(400).json({ error: "Line quantity must be positive" });
        }
      }
      if (supplierGstinOverride != null && supplierGstinOverride !== "") {
        const g = String(supplierGstinOverride).trim().toUpperCase();
        if (!/^[0-9A-Z]{15}$/.test(g)) return res.status(400).json({ error: "supplierGstinOverride must be 15 alphanumeric characters" });
      }
      if (supplierStateCodeOverride != null && supplierStateCodeOverride !== "") {
        const s = String(supplierStateCodeOverride).trim();
        if (!/^\d{2}$/.test(s)) return res.status(400).json({ error: "supplierStateCodeOverride must be a 2-digit state code" });
      }
      const result = await invoiceSvc.updateDraftInvoice(tid, req.params.id, {
        customerId,
        issueDate,
        dueDate,
        notes,
        costCenterId,
        incomeCategoryId,
        lines,
        supplierGstinOverride,
        supplierStateCodeOverride,
      });
      if ("error" in result) return res.status(409).json({ error: result.error });
      res.json(result.invoice);
    } catch (e) {
      logger.error("Update draft invoice error", { err: String(e) });
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update invoice" });
    }
  });

  app.post("/api/admin/invoicing/invoices/:id/issue", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const result = await invoiceSvc.issueInvoice(tid, req.params.id, user?.id);
      if ("error" in result) return res.status(409).json({ error: result.error });
      res.json(result.invoice);
    } catch (e) {
      logger.error("Issue invoice error", { err: String(e) });
      res.status(500).json({ error: "Failed to issue invoice" });
    }
  });

  app.post("/api/admin/invoicing/invoices/:id/void", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const result = await invoiceSvc.voidInvoice(tid, req.params.id, user?.id);
      if ("error" in result) return res.status(409).json({ error: result.error });
      res.json(result.invoice);
    } catch (e) {
      logger.error("Void invoice error", { err: String(e) });
      res.status(500).json({ error: "Failed to void invoice" });
    }
  });

  // ── Payments ──

  app.post("/api/admin/invoicing/invoices/:id/payments", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { amount, method, reference, paymentDate } = req.body;
      if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "amount must be a positive integer (rupees)" });
      const result = await allocSvc.recordManualPayment({
        tenantId: tid,
        invoiceId: req.params.id,
        amount: Math.round(amount),
        method,
        reference,
        paymentDate,
      });
      if ("error" in result) return res.status(400).json({ error: result.error });
      res.status(201).json(result);
    } catch (e) {
      logger.error("Record payment error", { err: String(e) });
      res.status(500).json({ error: "Failed to record payment" });
    }
  });

  // ── Invoice document preview ──

  const docPort = new HtmlInvoiceDocument(db);

  app.get("/api/admin/invoicing/invoices/:id/preview", requireTenantStaff, async (req, res) => {
    try {
      const html = await docPort.generateHtml(req.params.id);
      res.type("html").send(html);
    } catch (e) {
      logger.error("Invoice preview error", { err: String(e) });
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  app.post("/api/admin/invoicing/invoices/:id/send", requireTenantStaff, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });

      const inv = await invoiceSvc.getInvoice(tid, req.params.id);
      if (!inv) return res.status(404).json({ error: "Invoice not found" });
      if (!inv.customer?.email) return res.status(400).json({ error: "Customer has no email address" });

      const html = await docPort.generateHtml(inv.id);
      const payUrl = `${req.protocol}://${req.get("host")}/pay/${inv.id}`;
      const emailHtml = html.replace("</body>", `<div style="text-align:center;margin:32px 0;"><a href="${payUrl}" style="display:inline-block;padding:12px 32px;background:#0066FF;color:white;text-decoration:none;border-radius:6px;font-weight:600;">Pay Now</a></div></body>`);

      if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "Email not configured (RESEND_API_KEY missing)" });

      const sent = await sendFinJoeEmail(
        [inv.customer.email],
        `Invoice ${inv.invoiceNumber}`,
        emailHtml,
        { tenantId: tid },
        req.requestId
      );
      if (!sent) {
        logger.error("Invoice email send error", { tenantId: tid, invoiceId: inv.id });
        return res.status(502).json({ error: "Failed to send email" });
      }
      res.json({ ok: true, to: inv.customer.email });
    } catch (e) {
      logger.error("Invoice send error", { err: String(e) });
      res.status(500).json({ error: "Failed to send invoice" });
    }
  });

  // ── Public pay endpoints (no auth required) ──

  app.get("/api/invoices/:id/pay-info", async (req, res) => {
    try {
      const [inv] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          total: invoices.total,
          amountPaid: invoices.amountPaid,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
          tenantId: invoices.tenantId,
          customerId: invoices.customerId,
        })
        .from(invoices)
        .where(eq(invoices.id, req.params.id))
        .limit(1);
      if (!inv) return res.status(404).json({ error: "Invoice not found" });
      if (inv.status === "draft" || inv.status === "void") {
        return res.status(400).json({ error: "This invoice is not payable" });
      }
      const remaining = inv.total - inv.amountPaid;
      if (remaining <= 0) {
        return res.status(400).json({ error: "This invoice is already fully paid" });
      }
      const [cust] = await db
        .select({ name: billingCustomers.name })
        .from(billingCustomers)
        .where(eq(billingCustomers.id, inv.customerId))
        .limit(1);
      res.json({
        invoiceNumber: inv.invoiceNumber,
        total: inv.total,
        amountPaid: inv.amountPaid,
        remaining,
        currency: inv.currency,
        dueDate: inv.dueDate,
        customerName: cust?.name ?? null,
        gatewayConfigured: razorpayConfigured(),
      });
    } catch (e) {
      logger.error("Pay info error", { err: String(e) });
      res.status(500).json({ error: "Failed to load invoice" });
    }
  });

  app.post("/api/invoices/:id/create-order", async (req, res) => {
    try {
      if (!razorpayConfigured()) {
        return res.status(503).json({ error: "Payment gateway is not configured" });
      }
      const [inv] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, req.params.id))
        .limit(1);
      if (!inv) return res.status(404).json({ error: "Invoice not found" });
      if (inv.status === "draft" || inv.status === "void") {
        return res.status(400).json({ error: "This invoice is not payable" });
      }
      const remaining = inv.total - inv.amountPaid;
      if (remaining <= 0) {
        return res.status(400).json({ error: "This invoice is already fully paid" });
      }

      const catId = inv.incomeCategoryId ?? await (async () => {
        const rows = await db
          .select({ id: incomeCategories.id })
          .from(incomeCategories)
          .where(and(eq(incomeCategories.tenantId, inv.tenantId), eq(incomeCategories.isActive, true)))
          .limit(1);
        return rows[0]?.id ?? null;
      })();
      if (!catId) {
        return res.status(400).json({ error: "No income category configured for this tenant" });
      }

      const receipt = `inv_${inv.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);
      const { id: razorpayOrderId } = await razorpayCreateOrder({
        amountPaise: remaining * 100,
        receipt,
        notes: { tenantId: inv.tenantId, invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
      });

      const ccId = inv.costCenterId && inv.costCenterId !== "__corporate__" ? inv.costCenterId : null;
      await db.insert(paymentOrders).values({
        tenantId: inv.tenantId,
        amountRupees: remaining,
        currency: inv.currency,
        razorpayOrderId,
        status: "created",
        paymentType: "invoice_payment",
        incomeCategoryId: catId,
        costCenterId: ccId,
        metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
      });

      res.status(201).json({ orderId: razorpayOrderId });
    } catch (e) {
      logger.error("Invoice create-order error", { err: String(e) });
      res.status(500).json({ error: "Failed to create payment order" });
    }
  });
}
