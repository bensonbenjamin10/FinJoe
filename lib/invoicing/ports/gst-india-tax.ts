import type { CreateInvoiceLineInput, TaxResult, TaxCalculationContext, TaxBreakdownLine } from "./types.js";
import type { TaxCalculationPort } from "./tax-calculation-port.js";

export class GstIndiaTax implements TaxCalculationPort {
  private supplierStateCode: string | undefined;

  constructor(config: Record<string, unknown> = {}) {
    this.supplierStateCode = typeof config.supplierStateCode === "string"
      ? config.supplierStateCode
      : undefined;
  }

  calculate(lines: CreateInvoiceLineInput[], context?: TaxCalculationContext): TaxResult {
    const supplierState = context?.supplierStateCode ?? this.supplierStateCode;
    const customerState = context?.customerStateCode;
    const isInterstate = !!(supplierState && customerState && supplierState !== customerState);

    const lineTotals: number[] = [];
    const lineTaxBreakdowns: TaxBreakdownLine[][] = [];
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const line of lines) {
      const lineSubtotal = Math.round(line.quantity * line.unitAmount);
      const rate = line.taxRate ?? 0;
      const lineTax = Math.round(lineSubtotal * rate / 100);
      subtotal += lineSubtotal;
      lineTotals.push(lineSubtotal + lineTax);

      const lineBreakdown: TaxBreakdownLine[] = [];
      if (rate > 0) {
        if (isInterstate) {
          totalIgst += lineTax;
          lineBreakdown.push({ code: "IGST", label: `IGST @${rate}%`, rate, amount: lineTax });
        } else {
          const halfRate = rate / 2;
          const cgst = Math.round(lineSubtotal * halfRate / 100);
          const sgst = lineTax - cgst;
          totalCgst += cgst;
          totalSgst += sgst;
          lineBreakdown.push(
            { code: "CGST", label: `CGST @${halfRate}%`, rate: halfRate, amount: cgst },
            { code: "SGST", label: `SGST @${halfRate}%`, rate: halfRate, amount: sgst },
          );
        }
      }
      lineTaxBreakdowns.push(lineBreakdown);
    }

    const taxAmount = totalCgst + totalSgst + totalIgst;
    const taxBreakdown: TaxBreakdownLine[] = [];
    if (totalCgst > 0) taxBreakdown.push({ code: "CGST", label: "CGST", rate: 0, amount: totalCgst });
    if (totalSgst > 0) taxBreakdown.push({ code: "SGST", label: "SGST", rate: 0, amount: totalSgst });
    if (totalIgst > 0) taxBreakdown.push({ code: "IGST", label: "IGST", rate: 0, amount: totalIgst });

    return { subtotal, taxAmount, total: subtotal + taxAmount, lineTotals, taxBreakdown, lineTaxBreakdowns };
  }
}
