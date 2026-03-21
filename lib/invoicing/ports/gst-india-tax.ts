import type { CreateInvoiceLineInput, TaxResult } from "./types.js";
import type { TaxCalculationPort } from "./tax-calculation-port.js";

/**
 * Stub GST India tax engine. V1 behaves identically to flat tax (line-level
 * percentage), but is registered under the "gst_in" regime so tenants opting
 * in get the right label path.
 *
 * Future work will split into CGST/SGST/IGST based on place of supply,
 * validate HSN/SAC codes, and produce structured tax-line output via
 * an extended TaxResult.
 */
export class GstIndiaTax implements TaxCalculationPort {
  constructor(private config: Record<string, unknown> = {}) {}

  calculate(lines: CreateInvoiceLineInput[]): TaxResult {
    const lineTotals: number[] = [];
    let subtotal = 0;
    let taxAmount = 0;
    for (const line of lines) {
      const lineSubtotal = Math.round(line.quantity * line.unitAmount);
      const lineTax = Math.round(lineSubtotal * (line.taxRate ?? 0) / 100);
      lineTotals.push(lineSubtotal + lineTax);
      subtotal += lineSubtotal;
      taxAmount += lineTax;
    }
    return { subtotal, taxAmount, total: subtotal + taxAmount, lineTotals };
  }
}
