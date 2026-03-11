/**
 * Parse bank statement CSV for expense/income import.
 * Supported format: Date, Particulars, Withdrawals, Deposits, A/C, Major Head, Branch
 * Flexible column matching (case-insensitive).
 */

import Papa from "papaparse";

export type ParsedExpenseRow = {
  date: string;
  particulars: string;
  amount: number;
  majorHead?: string;
  branch?: string;
  categoryMatch: string;
};

export type ParsedIncomeRow = {
  date: string;
  particulars: string;
  amount: number;
  categoryMatch: string;
};

const DATE_HEADERS = ["date", "transaction date", "value date", "txn date"];
const PARTICULARS_HEADERS = ["particulars", "description", "narration", "remarks"];
const WITHDRAWAL_HEADERS = ["withdrawals", "withdrawal", "debit", "debits"];
const DEPOSIT_HEADERS = ["deposits", "deposit", "credit", "credits"];
const BRANCH_HEADERS = ["branch", "location", "cost center", "campus", "major head"];

function findColumn(row: Record<string, string>, headers: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const h of headers) {
    const key = keys.find((k) => k.toLowerCase().trim() === h);
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return undefined;
}

function parseAmount(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = String(val).replace(/,/g, "").replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
}

function parseDate(val: string | undefined): string | null {
  if (!val?.trim()) return null;
  const s = val.trim();
  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Keyword-to-category slug mapping for expense categorization */
const EXPENSE_KEYWORDS: Array<{ keywords: string[]; slug: string }> = [
  { keywords: ["petrol", "fuel", "diesel", "conveyance", "travel", "transport"], slug: "travel" },
  { keywords: ["stationery", "supplies", "office"], slug: "office_supplies" },
  { keywords: ["rent"], slug: "rent" },
  { keywords: ["utilities", "electricity", "water", "gas"], slug: "utilities" },
  { keywords: ["misc", "miscellaneous", "other", "sundry"], slug: "miscellaneous" },
];

function matchExpenseCategory(particulars: string, categorySlugs: string[]): string {
  const lower = particulars.toLowerCase();
  for (const { keywords, slug } of EXPENSE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k)) && categorySlugs.includes(slug)) {
      return slug;
    }
  }
  return categorySlugs[0] ?? "miscellaneous";
}

function matchIncomeCategory(particulars: string, categorySlugs: string[]): string {
  const lower = particulars.toLowerCase();
  if (categorySlugs.includes("fee") && (lower.includes("fee") || lower.includes("fees"))) return "fee";
  if (categorySlugs.includes("donation") && lower.includes("donation")) return "donation";
  return categorySlugs[0] ?? "other";
}

export type ParseResult = {
  expenses: ParsedExpenseRow[];
  income: ParsedIncomeRow[];
  skippedZero: number;
};

export function parseBankStatementCsv(
  buffer: Buffer,
  expenseCategorySlugs: string[],
  incomeCategorySlugs: string[]
): ParseResult {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data ?? [];
  const expenses: ParsedExpenseRow[] = [];
  const income: ParsedIncomeRow[] = [];
  let skippedZero = 0;

  for (const row of rows) {
    const dateVal = findColumn(row, DATE_HEADERS) ?? row["Date"] ?? row["date"];
    const date = parseDate(dateVal);
    const particulars = findColumn(row, PARTICULARS_HEADERS) ?? row["Particulars"] ?? row["particulars"] ?? "";

    const withdrawalStr = findColumn(row, WITHDRAWAL_HEADERS) ?? row["Withdrawals"] ?? row["withdrawals"];
    const depositStr = findColumn(row, DEPOSIT_HEADERS) ?? row["Deposits"] ?? row["deposits"];
    const branch = findColumn(row, BRANCH_HEADERS) ?? row["Branch"] ?? row["branch"];

    const withdrawalVal = parseAmount(withdrawalStr);
    const depositVal = parseAmount(depositStr);

    if (withdrawalVal != null && withdrawalVal > 0) {
      if (!date) continue;
      const categorySlug = matchExpenseCategory(particulars, expenseCategorySlugs);
      const categoryName = expenseCategorySlugs.includes(categorySlug) ? categorySlug : expenseCategorySlugs[0] ?? categorySlug;
      expenses.push({
        date,
        particulars,
        amount: withdrawalVal,
        categoryMatch: categoryName,
        branch: branch ?? undefined,
      });
    } else if (depositVal != null && depositVal > 0) {
      if (!date) continue;
      const categorySlug = matchIncomeCategory(particulars, incomeCategorySlugs);
      const categoryName = incomeCategorySlugs.includes(categorySlug) ? categorySlug : incomeCategorySlugs[0] ?? categorySlug;
      income.push({
        date,
        particulars,
        amount: depositVal,
        categoryMatch: categoryName,
      });
    } else {
      if (withdrawalVal === 0 && depositVal === 0) skippedZero++;
    }
  }

  return { expenses, income, skippedZero };
}
