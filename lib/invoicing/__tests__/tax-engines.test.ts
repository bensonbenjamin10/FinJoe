import { describe, it, expect } from "vitest";
import { FlatTaxCalculation } from "../ports/tax-calculation-port.js";
import { GstIndiaTax } from "../ports/gst-india-tax.js";
import type { CreateInvoiceLineInput } from "../ports/types.js";

const line = (qty: number, unitAmount: number, taxRate: number): CreateInvoiceLineInput => ({
  description: "Test item",
  quantity: qty,
  unitAmount,
  taxRate,
});

describe("FlatTaxCalculation", () => {
  const calc = new FlatTaxCalculation();

  it("computes subtotal, tax, total for a single line", () => {
    const result = calc.calculate([line(2, 500, 18)]);
    expect(result.subtotal).toBe(1000);
    expect(result.taxAmount).toBe(180);
    expect(result.total).toBe(1180);
    expect(result.lineTotals).toEqual([1180]);
  });

  it("handles zero tax rate", () => {
    const result = calc.calculate([line(1, 1000, 0)]);
    expect(result.subtotal).toBe(1000);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(1000);
  });

  it("handles multiple lines", () => {
    const result = calc.calculate([line(1, 1000, 10), line(3, 200, 5)]);
    expect(result.subtotal).toBe(1600);
    expect(result.taxAmount).toBe(130);
    expect(result.total).toBe(1730);
    expect(result.lineTotals).toHaveLength(2);
  });

  it("ignores context parameter", () => {
    const result = calc.calculate([line(1, 100, 10)], { supplierStateCode: "27", customerStateCode: "29" });
    expect(result.taxBreakdown).toBeUndefined();
  });
});

describe("GstIndiaTax", () => {
  describe("intrastate (same state -> CGST + SGST)", () => {
    const calc = new GstIndiaTax({ supplierStateCode: "27" });

    it("splits 18% into CGST 9% + SGST 9%", () => {
      const result = calc.calculate([line(1, 1000, 18)], { supplierStateCode: "27", customerStateCode: "27" });
      expect(result.subtotal).toBe(1000);
      expect(result.taxAmount).toBe(180);
      expect(result.total).toBe(1180);
      expect(result.taxBreakdown).toEqual([
        { code: "CGST", label: "CGST", rate: 0, amount: 90 },
        { code: "SGST", label: "SGST", rate: 0, amount: 90 },
      ]);
      expect(result.lineTaxBreakdowns![0]).toEqual([
        { code: "CGST", label: "CGST @9%", rate: 9, amount: 90 },
        { code: "SGST", label: "SGST @9%", rate: 9, amount: 90 },
      ]);
    });

    it("handles odd tax rates (rounding)", () => {
      const result = calc.calculate([line(1, 1000, 5)], { supplierStateCode: "27", customerStateCode: "27" });
      expect(result.taxAmount).toBe(50);
      const cgst = result.lineTaxBreakdowns![0][0].amount;
      const sgst = result.lineTaxBreakdowns![0][1].amount;
      expect(cgst + sgst).toBe(50);
    });
  });

  describe("interstate (different states -> IGST)", () => {
    const calc = new GstIndiaTax({ supplierStateCode: "27" });

    it("uses full rate as IGST", () => {
      const result = calc.calculate([line(1, 1000, 18)], { supplierStateCode: "27", customerStateCode: "29" });
      expect(result.taxAmount).toBe(180);
      expect(result.taxBreakdown).toEqual([
        { code: "IGST", label: "IGST", rate: 0, amount: 180 },
      ]);
      expect(result.lineTaxBreakdowns![0]).toEqual([
        { code: "IGST", label: "IGST @18%", rate: 18, amount: 180 },
      ]);
    });
  });

  describe("edge cases", () => {
    const calc = new GstIndiaTax({});

    it("zero tax rate produces no breakdown", () => {
      const result = calc.calculate([line(1, 1000, 0)], { supplierStateCode: "27", customerStateCode: "29" });
      expect(result.taxAmount).toBe(0);
      expect(result.taxBreakdown).toEqual([]);
      expect(result.lineTaxBreakdowns![0]).toEqual([]);
    });

    it("missing customer state defaults to intrastate", () => {
      const result = calc.calculate([line(1, 1000, 18)], { supplierStateCode: "27" });
      expect(result.taxBreakdown).toEqual([
        { code: "CGST", label: "CGST", rate: 0, amount: 90 },
        { code: "SGST", label: "SGST", rate: 0, amount: 90 },
      ]);
    });

    it("missing both states defaults to intrastate", () => {
      const result = calc.calculate([line(1, 1000, 18)]);
      expect(result.taxBreakdown).toEqual([
        { code: "CGST", label: "CGST", rate: 0, amount: 90 },
        { code: "SGST", label: "SGST", rate: 0, amount: 90 },
      ]);
    });
  });
});
