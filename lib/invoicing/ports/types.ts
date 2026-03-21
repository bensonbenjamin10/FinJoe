export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface CreateInvoiceInput {
  tenantId: string;
  customerId: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
  costCenterId?: string | null;
  incomeCategoryId?: string | null;
  lines: CreateInvoiceLineInput[];
}

export interface CreateInvoiceLineInput {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
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

export interface TaxResult {
  subtotal: number;
  taxAmount: number;
  total: number;
  lineTotals: number[];
}

export interface PaymentCaptureResult {
  provider: string;
  externalPaymentId: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
}
