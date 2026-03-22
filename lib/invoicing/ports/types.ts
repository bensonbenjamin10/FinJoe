export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
}

export interface CreateInvoiceInput {
  tenantId: string;
  customerId: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
  costCenterId?: string | null;
  incomeCategoryId?: string | null;
  /** Per-invoice supplier GSTIN override (India GST); null clears on update. */
  supplierGstinOverride?: string | null;
  /** Per-invoice 2-digit state override; null clears on update. */
  supplierStateCodeOverride?: string | null;
  lines: CreateInvoiceLineInput[];
}

export interface CreateInvoiceLineInput {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
  hsnCode?: string | null;
  incomeCategoryId?: string | null;
  displayOrder?: number;
}

export interface RecordPaymentInput {
  tenantId: string;
  invoiceId: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  paymentDate?: string;
  paymentOrderId?: string | null;
  provider?: string | null;
  externalPaymentId?: string | null;
}

export interface TaxBreakdownLine {
  code: string;
  label: string;
  rate: number;
  amount: number;
}

export interface TaxResult {
  subtotal: number;
  taxAmount: number;
  total: number;
  lineTotals: number[];
  taxBreakdown?: TaxBreakdownLine[];
  lineTaxBreakdowns?: TaxBreakdownLine[][];
}

export interface TaxCalculationContext {
  supplierStateCode?: string;
  customerStateCode?: string;
}

export interface PaymentCaptureResult {
  provider: string;
  externalPaymentId: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
}
