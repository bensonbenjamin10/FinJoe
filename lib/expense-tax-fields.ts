/**
 * Optional GST/tax breakdown on expenses — same integer rupee convention as `expenses.amount`.
 */

export type ExpenseTaxFields = {
  baseAmount?: number;
  taxAmount?: number;
  /** Whole percent 0–100 (matches invoice_lines.tax_rate usage). */
  taxRate?: number;
};

function roundMoney(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const x = parseFloat(v.replace(/,/g, "").trim());
    return Number.isFinite(x) ? Math.round(x) : undefined;
  }
  return undefined;
}

/** Parse optional tax fields from model JSON or tool args (rupees integer, rate 0–100). */
export function parseExpenseTaxFields(record: Record<string, unknown>): ExpenseTaxFields {
  const baseAmount = roundMoney(record.baseAmount);
  const taxAmount = roundMoney(record.taxAmount);
  let taxRate = roundMoney(record.taxRate);
  if (taxRate != null && (taxRate < 0 || taxRate > 100)) taxRate = undefined;
  const out: ExpenseTaxFields = {};
  if (baseAmount != null && baseAmount >= 0) out.baseAmount = baseAmount;
  if (taxAmount != null && taxAmount >= 0) out.taxAmount = taxAmount;
  if (taxRate != null) out.taxRate = taxRate;
  return out;
}
