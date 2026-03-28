/**
 * Zoho Books–friendly CSV (bills + manual journal style columns for import testing).
 * Users can map columns in Zoho's import UI; this is a sensible default layout.
 */

import type { AccountingExportRow } from "./accounting-export/engine.js";
import { paiseToRupeesStr } from "./accounting-export/engine.js";

function escapeCsvField(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Expense lines as bill-style rows */
export function buildZohoBillsCsv(rows: AccountingExportRow[]): string {
  const header = [
    "Line Type",
    "Date",
    "Bill Number",
    "Vendor Name",
    "Account",
    "Description",
    "Amount",
    "Tax",
    "Reference (FinJoe ID)",
  ].join(",");

  const lines = [header];
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const date = r.expenseDate ?? "";
    const vendor = r.vendorName ?? "";
    const acct = r.categoryName ?? "";
    const desc = [r.description, r.particulars].filter(Boolean).join(" ") || "Expense";
    const amt = paiseToRupeesStr(r.amountPaise);
    const tax =
      r.taxAmountPaise != null && r.taxAmountPaise > 0 ? paiseToRupeesStr(r.taxAmountPaise) : "";
    const billNo = r.invoiceNumber ?? "";
    lines.push(
      [
        "Bill",
        escapeCsvField(date),
        escapeCsvField(billNo),
        escapeCsvField(vendor),
        escapeCsvField(acct),
        escapeCsvField(desc),
        escapeCsvField(amt),
        escapeCsvField(tax),
        escapeCsvField(r.id),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

/** Income as deposit / other income rows */
export function buildZohoIncomeCsv(rows: AccountingExportRow[]): string {
  const header = ["Date", "Income Account", "Amount", "Description", "Reference (FinJoe ID)"].join(",");
  const lines = [header];
  for (const r of rows) {
    if (r.kind !== "income") continue;
    const date = r.incomeDate ?? "";
    const acct = r.categoryName ?? "Other Income";
    const amt = paiseToRupeesStr(r.amountPaise);
    const desc = r.particulars ?? "";
    lines.push(
      [
        escapeCsvField(date),
        escapeCsvField(acct),
        escapeCsvField(amt),
        escapeCsvField(desc),
        escapeCsvField(r.id),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}
