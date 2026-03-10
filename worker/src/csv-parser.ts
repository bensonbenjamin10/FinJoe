/**
 * Parse expense rows from CSV buffer. Used when user sends CSV file via WhatsApp.
 */

import Papa from "papaparse";
import { parseAmount } from "./agent/gemini.js";
import type { ExtractedExpenseRow } from "./agent/gemini.js";

const AMOUNT_HEADERS = ["amount", "Amount", "AMOUNT", "Withdrawals", "withdrawals"];
const VENDOR_HEADERS = ["name", "Name", "vendorName", "Vendor", "Payee"];
const DESCRIPTION_HEADERS = ["particulars", "Particulars", "description", "Description"];
const CAMPUS_HEADERS = ["campus", "Campus", "Location", "location"];

function findColumn(row: Record<string, string>, headers: string[]): string | undefined {
  const keys = Object.keys(row);
  const keyMap = Object.fromEntries(keys.map((k) => [k.toLowerCase(), k]));
  for (const h of headers) {
    const val = row[h] ?? (keyMap[h.toLowerCase()] ? row[keyMap[h.toLowerCase()]] : undefined);
    if (val?.trim()) return val.trim();
  }
  return undefined;
}

/** Parse CSV buffer to ExtractedExpenseRow[]. Skips rows without valid amount. */
export function parseExpensesFromCsv(buffer: Buffer): ExtractedExpenseRow[] {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data ?? [];
  const result: ExtractedExpenseRow[] = [];

  for (const row of rows) {
    const amountVal = findColumn(row, AMOUNT_HEADERS) ?? row["amount"] ?? row["Amount"];
    const amount = parseAmount(amountVal);
    if (amount == null) continue;

    const vendorName = findColumn(row, VENDOR_HEADERS);
    const description = findColumn(row, DESCRIPTION_HEADERS);
    const campus = findColumn(row, CAMPUS_HEADERS);

    result.push({
      amount,
      vendorName: vendorName || undefined,
      description: description || undefined,
      campus: campus || undefined,
    });
  }

  return result;
}
