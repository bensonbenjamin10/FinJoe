import { eq, and } from "drizzle-orm";
import {
  paymentAllocations,
  invoices,
  incomeRecords,
} from "../../../shared/schema.js";
import type { RecordPaymentInput } from "../ports/types.js";
import { createFinJoeData } from "../../finjoe-data.js";
import { createInvoiceService, type InvoicingDb } from "./invoice-service.js";

export function createPaymentAllocationService(db: InvoicingDb) {
  const invoiceSvc = createInvoiceService(db);

  return {
    async recordManualPayment(input: RecordPaymentInput) {
      const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId))).limit(1);
      if (!inv) return { error: "Invoice not found" };
      if (inv.status === "void" || inv.status === "draft") return { error: `Cannot record payment on ${inv.status} invoice` };

      const remaining = inv.total - inv.amountPaid;
      if (input.amount <= 0) return { error: "Payment amount must be positive" };
      if (input.amount > remaining) return { error: `Payment amount ₹${input.amount} exceeds remaining ₹${remaining}` };

      const today = input.paymentDate ?? new Date().toISOString().slice(0, 10);

      const finJoeData = createFinJoeData(db, input.tenantId);
      const categoryId = inv.incomeCategoryId;
      if (!categoryId) return { error: "Invoice has no income category for ledger posting" };

      const incomeRecord = await finJoeData.createIncome({
        tenantId: input.tenantId,
        costCenterId: inv.costCenterId,
        categoryId,
        amount: input.amount,
        incomeDate: today,
        particulars: `Invoice ${inv.invoiceNumber}${input.reference ? ` · ${input.reference}` : ""}`,
        incomeType: "other",
        source: "invoice_payment",
      });
      if (!incomeRecord?.id) return { error: "Failed to post income record" };

      const [alloc] = await db.insert(paymentAllocations).values({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        amount: input.amount,
        paymentOrderId: input.paymentOrderId ?? null,
        incomeRecordId: incomeRecord.id,
        provider: input.provider ?? "manual",
        externalPaymentId: input.externalPaymentId ?? null,
        method: input.method ?? null,
        reference: input.reference ?? null,
        paymentDate: new Date(today),
      }).returning();

      await invoiceSvc.updateInvoicePaidAmount(input.invoiceId);

      return { allocation: alloc, incomeRecordId: incomeRecord.id };
    },

    async allocateGatewayPayment(params: {
      tenantId: string;
      invoiceId: string;
      amount: number;
      paymentOrderId: string;
      incomeRecordId: string;
      provider: string;
      externalPaymentId: string;
    }) {
      const [alloc] = await db.insert(paymentAllocations).values({
        tenantId: params.tenantId,
        invoiceId: params.invoiceId,
        amount: params.amount,
        paymentOrderId: params.paymentOrderId,
        incomeRecordId: params.incomeRecordId,
        provider: params.provider,
        externalPaymentId: params.externalPaymentId,
        paymentDate: new Date(),
      }).returning();

      await invoiceSvc.updateInvoicePaidAmount(params.invoiceId);
      return alloc;
    },
  };
}
