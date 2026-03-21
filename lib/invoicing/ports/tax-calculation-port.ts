import type { CreateInvoiceLineInput, TaxResult, TaxCalculationContext } from "./types.js";

export interface TaxCalculationPort {
  calculate(lines: CreateInvoiceLineInput[], context?: TaxCalculationContext): TaxResult;
}

export class FlatTaxCalculation implements TaxCalculationPort {
  calculate(lines: CreateInvoiceLineInput[], _context?: TaxCalculationContext): TaxResult {
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
