import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import {
  billingCustomers,
  invoices,
  invoiceLines,
  incomeCategories,
  costCenters,
  paymentAllocations,
  tenants,
} from "../../../shared/schema.js";
import type {
  CreateCustomerInput,
  CreateInvoiceInput,
  CreateInvoiceLineInput,
  InvoiceStatus,
  TaxCalculationContext,
} from "../ports/types.js";
import type { TaxCalculationPort } from "../ports/tax-calculation-port.js";
import { getTaxEngine } from "../ports/tax-regime-registry.js";

function gstinToStateCode(gstin: string | null | undefined): string | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return gstin.slice(0, 2);
}

export type InvoicingDb = any;

function nextInvoiceNumber(tenantSlug: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `INV-${ts}`;
}

async function resolveTaxCalc(db: InvoicingDb, tenantId: string): Promise<TaxCalculationPort> {
  const [t] = await db
    .select({ taxRegime: tenants.taxRegime, taxRegimeConfig: tenants.taxRegimeConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const regime = t?.taxRegime ?? "flat_percent";
  const config = (t?.taxRegimeConfig as Record<string, unknown>) ?? {};
  return getTaxEngine(regime, config);
}

export function createInvoiceService(db: InvoicingDb) {
  return {
    async listCustomers(tenantId: string, opts?: { search?: string }) {
      const conditions = [eq(billingCustomers.tenantId, tenantId), eq(billingCustomers.isActive, true)];
      if (opts?.search) {
        conditions.push(sql`lower(${billingCustomers.name}) like ${"%" + opts.search.toLowerCase() + "%"}`);
      }
      return db
        .select()
        .from(billingCustomers)
        .where(and(...conditions))
        .orderBy(billingCustomers.name);
    },

    async getCustomer(tenantId: string, id: string) {
      const [row] = await db
        .select()
        .from(billingCustomers)
        .where(and(eq(billingCustomers.id, id), eq(billingCustomers.tenantId, tenantId)))
        .limit(1);
      return row ?? null;
    },

    async createCustomer(input: CreateCustomerInput) {
      const [created] = await db
        .insert(billingCustomers)
        .values({
          tenantId: input.tenantId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          gstin: input.gstin ?? null,
        })
        .returning();
      return created;
    },

    async updateCustomer(tenantId: string, id: string, updates: Partial<CreateCustomerInput>) {
      const vals: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) vals.name = updates.name;
      if (updates.email !== undefined) vals.email = updates.email;
      if (updates.phone !== undefined) vals.phone = updates.phone;
      if (updates.address !== undefined) vals.address = updates.address;
      if (updates.gstin !== undefined) vals.gstin = updates.gstin;
      const [updated] = await db
        .update(billingCustomers)
        .set(vals)
        .where(and(eq(billingCustomers.id, id), eq(billingCustomers.tenantId, tenantId)))
        .returning();
      return updated ?? null;
    },

    async createInvoice(input: CreateInvoiceInput) {
      if (!input.lines.length) throw new Error("At least one line item required");

      const taxCalc = await resolveTaxCalc(db, input.tenantId);

      const [cust] = await db
        .select({ gstin: billingCustomers.gstin })
        .from(billingCustomers)
        .where(eq(billingCustomers.id, input.customerId))
        .limit(1);

      const [tenant] = await db
        .select({ taxRegime: tenants.taxRegime, taxRegimeConfig: tenants.taxRegimeConfig })
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);

      const supplierGstin = typeof tenant?.taxRegimeConfig === "object" && tenant.taxRegimeConfig
        ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierGstin ?? "")
        : "";

      const taxContext: TaxCalculationContext = {
        supplierStateCode: gstinToStateCode(supplierGstin) ?? (typeof tenant?.taxRegimeConfig === "object" && tenant.taxRegimeConfig ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierStateCode ?? "") : undefined),
        customerStateCode: gstinToStateCode(cust?.gstin),
      };

      const result = taxCalc.calculate(input.lines, taxContext);
      const { subtotal, taxAmount, total, lineTotals, taxBreakdown, lineTaxBreakdowns } = result;
      const invoiceNumber = nextInvoiceNumber(input.tenantId);
      const ccId = input.costCenterId && input.costCenterId !== "__corporate__" ? input.costCenterId : null;

      const ext: Record<string, unknown> = {};
      if (taxBreakdown?.length) ext.taxBreakdown = taxBreakdown;
      if (supplierGstin) ext.supplierGstin = supplierGstin;
      if (cust?.gstin) ext.customerGstin = cust.gstin;

      const [inv] = await db
        .insert(invoices)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          invoiceNumber,
          status: "draft" as InvoiceStatus,
          issueDate: input.issueDate ? new Date(input.issueDate) : null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          subtotal,
          taxAmount,
          total,
          amountPaid: 0,
          notes: input.notes ?? null,
          costCenterId: ccId,
          incomeCategoryId: input.incomeCategoryId ?? null,
          ext,
        })
        .returning();

      const lineValues = input.lines.map((l, i) => {
        const lineExt: Record<string, unknown> = {};
        if (l.hsnCode) lineExt.hsnCode = l.hsnCode;
        if (lineTaxBreakdowns?.[i]?.length) lineExt.taxBreakdown = lineTaxBreakdowns[i];
        return {
          invoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          taxRate: l.taxRate ?? 0,
          lineTotal: lineTotals[i],
          incomeCategoryId: l.incomeCategoryId ?? null,
          displayOrder: l.displayOrder ?? i,
          ext: Object.keys(lineExt).length ? lineExt : {},
        };
      });
      await db.insert(invoiceLines).values(lineValues);

      return inv;
    },

    async updateDraftInvoice(tenantId: string, id: string, input: {
      customerId?: string;
      issueDate?: string;
      dueDate?: string;
      notes?: string | null;
      costCenterId?: string | null;
      incomeCategoryId?: string | null;
      lines?: CreateInvoiceInput["lines"];
    }) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) return { error: "Invoice not found" };
      if (inv.status !== "draft") return { error: "Only draft invoices can be edited" };

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.customerId !== undefined) updates.customerId = input.customerId;
      if (input.issueDate !== undefined) updates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.notes !== undefined) updates.notes = input.notes ?? null;
      if (input.costCenterId !== undefined) {
        updates.costCenterId = input.costCenterId && input.costCenterId !== "__corporate__" ? input.costCenterId : null;
      }
      if (input.incomeCategoryId !== undefined) updates.incomeCategoryId = input.incomeCategoryId ?? null;

      if (input.lines && input.lines.length > 0) {
        const taxCalc = await resolveTaxCalc(db, tenantId);
        const customerId = input.customerId ?? inv.customerId;
        const [cust] = await db
          .select({ gstin: billingCustomers.gstin })
          .from(billingCustomers)
          .where(eq(billingCustomers.id, customerId))
          .limit(1);
        const [tenant] = await db
          .select({ taxRegimeConfig: tenants.taxRegimeConfig })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        const supplierGstin = typeof tenant?.taxRegimeConfig === "object" && tenant.taxRegimeConfig
          ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierGstin ?? "")
          : "";
        const taxContext: TaxCalculationContext = {
          supplierStateCode: gstinToStateCode(supplierGstin) ?? (typeof tenant?.taxRegimeConfig === "object" && tenant.taxRegimeConfig ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierStateCode ?? "") : undefined),
          customerStateCode: gstinToStateCode(cust?.gstin),
        };

        const result = taxCalc.calculate(input.lines, taxContext);
        updates.subtotal = result.subtotal;
        updates.taxAmount = result.taxAmount;
        updates.total = result.total;

        const ext: Record<string, unknown> = {};
        if (result.taxBreakdown?.length) ext.taxBreakdown = result.taxBreakdown;
        if (supplierGstin) ext.supplierGstin = supplierGstin;
        if (cust?.gstin) ext.customerGstin = cust.gstin;
        updates.ext = ext;

        await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
        const lineValues = input.lines.map((l, i) => {
          const lineExt: Record<string, unknown> = {};
          if (l.hsnCode) lineExt.hsnCode = l.hsnCode;
          if (result.lineTaxBreakdowns?.[i]?.length) lineExt.taxBreakdown = result.lineTaxBreakdowns[i];
          return {
            invoiceId: id,
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            taxRate: l.taxRate ?? 0,
            lineTotal: result.lineTotals[i],
            incomeCategoryId: l.incomeCategoryId ?? null,
            displayOrder: l.displayOrder ?? i,
            ext: Object.keys(lineExt).length ? lineExt : {},
          };
        });
        await db.insert(invoiceLines).values(lineValues);
      }

      const [updated] = await db
        .update(invoices)
        .set(updates)
        .where(eq(invoices.id, id))
        .returning();
      return { invoice: updated };
    },

    async getInvoice(tenantId: string, id: string) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) return null;

      const lines = await db
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, id))
        .orderBy(invoiceLines.displayOrder);

      const allocs = await db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, id))
        .orderBy(desc(paymentAllocations.createdAt));

      const [cust] = await db
        .select({ name: billingCustomers.name, email: billingCustomers.email, phone: billingCustomers.phone, gstin: billingCustomers.gstin })
        .from(billingCustomers)
        .where(eq(billingCustomers.id, inv.customerId))
        .limit(1);

      return { ...inv, lines, allocations: allocs, customer: cust ?? null };
    },

    async listInvoices(tenantId: string, opts?: {
      status?: string;
      customerId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }) {
      const conditions = [eq(invoices.tenantId, tenantId)];
      if (opts?.status && opts.status !== "all") conditions.push(eq(invoices.status, opts.status));
      if (opts?.customerId) conditions.push(eq(invoices.customerId, opts.customerId));
      if (opts?.startDate) conditions.push(gte(invoices.issueDate, new Date(opts.startDate)));
      if (opts?.endDate) conditions.push(lte(invoices.issueDate, new Date(opts.endDate)));

      const lim = Math.min(opts?.limit ?? 100, 200);
      const off = opts?.offset ?? 0;

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(...conditions));

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          total: invoices.total,
          amountPaid: invoices.amountPaid,
          customerId: invoices.customerId,
          customerName: billingCustomers.name,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .leftJoin(billingCustomers, eq(invoices.customerId, billingCustomers.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(lim)
        .offset(off);

      return { rows, total: countRow?.count ?? 0 };
    },

    async getKpis(tenantId: string) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

      const [outstanding] = await db
        .select({ total: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)::int`, count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), sql`${invoices.status} IN ('issued', 'partially_paid')`));

      const [overdue] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, tenantId),
          sql`${invoices.status} IN ('issued', 'partially_paid')`,
          sql`${invoices.dueDate} < now()`,
        ));

      const [collected] = await db
        .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::int` })
        .from(paymentAllocations)
        .where(and(eq(paymentAllocations.tenantId, tenantId), gte(paymentAllocations.createdAt, new Date(monthStart))));

      return {
        outstandingAmount: outstanding?.total ?? 0,
        outstandingCount: outstanding?.count ?? 0,
        overdueCount: overdue?.count ?? 0,
        collectedThisMonth: collected?.total ?? 0,
      };
    },

    async issueInvoice(tenantId: string, id: string, userId?: string) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) return { error: "Invoice not found" };
      if (inv.status !== "draft") return { error: `Cannot issue invoice in status "${inv.status}"` };
      if (inv.total <= 0) return { error: "Invoice total must be greater than zero" };

      const [updated] = await db
        .update(invoices)
        .set({
          status: "issued" as InvoiceStatus,
          issueDate: inv.issueDate ?? new Date(),
          issuedById: userId ?? null,
          issuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();
      return { invoice: updated };
    },

    async voidInvoice(tenantId: string, id: string, userId?: string) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) return { error: "Invoice not found" };
      if (inv.status === "void") return { error: "Invoice is already void" };
      if (inv.amountPaid > 0) return { error: "Cannot void an invoice with payments. Reverse payments first." };

      const [updated] = await db
        .update(invoices)
        .set({
          status: "void" as InvoiceStatus,
          voidedById: userId ?? null,
          voidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();
      return { invoice: updated };
    },

    async updateInvoicePaidAmount(invoiceId: string) {
      const [sum] = await db
        .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::int` })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, invoiceId));
      const paid = sum?.total ?? 0;

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!inv) return;

      let newStatus: InvoiceStatus = inv.status as InvoiceStatus;
      if (inv.status !== "void" && inv.status !== "draft") {
        if (paid >= inv.total) newStatus = "paid";
        else if (paid > 0) newStatus = "partially_paid";
        else newStatus = "issued";
      }
      await db.update(invoices).set({ amountPaid: paid, status: newStatus, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
    },

    async previewTax(params: {
      tenantId: string;
      customerId: string | null;
      lines: CreateInvoiceLineInput[];
    }) {
      const taxCalc = await resolveTaxCalc(db, params.tenantId);
      let custGstin: string | null = null;
      if (params.customerId) {
        const [cust] = await db
          .select({ gstin: billingCustomers.gstin })
          .from(billingCustomers)
          .where(and(eq(billingCustomers.id, params.customerId), eq(billingCustomers.tenantId, params.tenantId)))
          .limit(1);
        custGstin = cust?.gstin ?? null;
      }
      const [tenant] = await db
        .select({ taxRegime: tenants.taxRegime, taxRegimeConfig: tenants.taxRegimeConfig })
        .from(tenants)
        .where(eq(tenants.id, params.tenantId))
        .limit(1);
      const supplierGstin =
        typeof tenant?.taxRegimeConfig === "object" && tenant?.taxRegimeConfig
          ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierGstin ?? "")
          : "";
      const taxContext: TaxCalculationContext = {
        supplierStateCode:
          gstinToStateCode(supplierGstin) ??
          (typeof tenant?.taxRegimeConfig === "object" && tenant?.taxRegimeConfig
            ? String((tenant.taxRegimeConfig as Record<string, unknown>).supplierStateCode ?? "") || undefined
            : undefined),
        customerStateCode: gstinToStateCode(custGstin),
      };
      const result = taxCalc.calculate(params.lines, taxContext);
      return {
        taxRegime: tenant?.taxRegime ?? "flat_percent",
        result,
      };
    },
  };
}
