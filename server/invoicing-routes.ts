import type { Express } from "express";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { requireAdmin, getTenantId } from "./auth.js";
import { createInvoiceService } from "../lib/invoicing/application/invoice-service.js";
import { createPaymentAllocationService } from "../lib/invoicing/application/payment-allocation-service.js";

export function registerInvoicingRoutes(app: Express) {
  const invoiceSvc = createInvoiceService(db);
  const allocSvc = createPaymentAllocationService(db);

  // ── Customers ──

  app.get("/api/admin/invoicing/customers", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/invoicing/customers", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { name, email, phone, address } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Customer name is required" });
      const created = await invoiceSvc.createCustomer({ tenantId: tid, name: name.trim(), email, phone, address });
      res.status(201).json(created);
    } catch (e) {
      logger.error("Create customer error", { err: String(e) });
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.patch("/api/admin/invoicing/customers/:id", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/invoicing/kpis", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/invoicing/invoices", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/invoicing/invoices/:id", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/invoicing/invoices", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      if (user.role !== "super_admin" && !tid) return res.status(403).json({ error: "Tenant context required" });
      if (!tid) return res.status(400).json({ error: "tenantId required" });
      const { customerId, issueDate, dueDate, notes, costCenterId, incomeCategoryId, lines } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId required" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: "At least one line item required" });
      for (const l of lines) {
        if (!l.description?.trim()) return res.status(400).json({ error: "Line description required" });
        if (typeof l.unitAmount !== "number" || l.unitAmount <= 0) return res.status(400).json({ error: "Line unit amount must be positive" });
        if (typeof l.quantity !== "number" || l.quantity <= 0) return res.status(400).json({ error: "Line quantity must be positive" });
      }
      const inv = await invoiceSvc.createInvoice({ tenantId: tid, customerId, issueDate, dueDate, notes, costCenterId, incomeCategoryId, lines });
      res.status(201).json(inv);
    } catch (e) {
      logger.error("Create invoice error", { err: String(e) });
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create invoice" });
    }
  });

  app.post("/api/admin/invoicing/invoices/:id/issue", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/invoicing/invoices/:id/void", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/invoicing/invoices/:id/payments", requireAdmin, async (req, res) => {
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
}
