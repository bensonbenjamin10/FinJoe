/**
 * Shared bank-statement CSV analyze logic (same response as POST /api/admin/expenses/import/analyze).
 */

import { eq, and, gte, lte, or, isNull } from "drizzle-orm";
import { db as drizzleDb } from "../server/db.js";
import { parseBankStatementCsv, isValidDateString } from "./bank-statement-parser.js";
import { analyzeImportSuggestions } from "./import-analyzer.js";
import { expenses, expenseCategories, incomeCategories, incomeRecords } from "../shared/schema.js";

type DuplicateInfo = {
  potentialDuplicate: boolean;
  matchConfidence?: "exact" | "probable";
  matchedExpenseId?: string;
  matchedExpenseStatus?: string;
  matchedExpenseSource?: string;
};

function safeDbDateKey(d: Date | null): string | null {
  if (d == null || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function shiftDate(dateStr: string | null | undefined, days: number): string {
  if (dateStr == null || !isValidDateString(dateStr)) return dateStr ?? "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + days);
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

function getDateRange(rows: Array<{ date: string | null }>): { minDate: string; maxDate: string } | null {
  const dates = rows.map((r) => r.date).filter((s): s is string => isValidDateString(s));
  if (dates.length === 0) return null;
  dates.sort();
  return { minDate: dates[0], maxDate: dates[dates.length - 1] };
}

function textsOverlap(particulars: string | undefined, description: string | null, vendorName: string | null): boolean {
  if (!particulars) return false;
  const p = particulars.toLowerCase();
  if (description) {
    const d = description.toLowerCase();
    if (d.includes(p.slice(0, 20)) || p.includes(d.slice(0, 20))) return true;
  }
  if (vendorName) {
    if (p.includes(vendorName.toLowerCase())) return true;
  }
  return false;
}

function findDuplicateExpenses(
  csvRows: Array<{ date: string | null; particulars: string; amount: number }>,
  existingExpenses: Array<{
    id: string;
    amount: number;
    expenseDate: Date | null;
    description: string | null;
    vendorName: string | null;
    status: string;
    source: string;
  }>
): DuplicateInfo[] {
  const byDateAmount = new Map<string, typeof existingExpenses>();
  for (const e of existingExpenses) {
    const dk = safeDbDateKey(e.expenseDate);
    const key = `${dk ?? "__no_date__"}|${e.amount}`;
    const arr = byDateAmount.get(key);
    if (arr) arr.push(e);
    else byDateAmount.set(key, [e]);
  }
  return csvRows.map((row) => {
    const rowDateKey = row.date && isValidDateString(row.date) ? row.date : "__no_date__";
    const key = `${rowDateKey}|${row.amount}`;
    const candidates = byDateAmount.get(key);
    if (!candidates || candidates.length === 0) {
      if (!row.date || !isValidDateString(row.date)) {
        return { potentialDuplicate: false };
      }
      const fuzzyKey1 = `${shiftDate(row.date, 1)}|${row.amount}`;
      const fuzzyKey2 = `${shiftDate(row.date, -1)}|${row.amount}`;
      const fuzzyCandidates = [...(byDateAmount.get(fuzzyKey1) ?? []), ...(byDateAmount.get(fuzzyKey2) ?? [])];
      if (fuzzyCandidates.length > 0) {
        const textMatch = fuzzyCandidates.find((e) => textsOverlap(row.particulars, e.description, e.vendorName));
        if (textMatch)
          return {
            potentialDuplicate: true,
            matchConfidence: "probable" as const,
            matchedExpenseId: textMatch.id,
            matchedExpenseStatus: textMatch.status,
            matchedExpenseSource: textMatch.source,
          };
      }
      return { potentialDuplicate: false };
    }
    const exact = candidates.find((e) => textsOverlap(row.particulars, e.description, e.vendorName));
    if (exact)
      return {
        potentialDuplicate: true,
        matchConfidence: "exact" as const,
        matchedExpenseId: exact.id,
        matchedExpenseStatus: exact.status,
        matchedExpenseSource: exact.source,
      };
    return {
      potentialDuplicate: true,
      matchConfidence: "probable" as const,
      matchedExpenseId: candidates[0].id,
      matchedExpenseStatus: candidates[0].status,
      matchedExpenseSource: candidates[0].source,
    };
  });
}

function findDuplicateIncome(
  csvRows: Array<{ date: string | null; particulars: string; amount: number }>,
  existingIncome: Array<{ id: string; amount: number; incomeDate: Date | null; particulars: string | null; source: string }>
): DuplicateInfo[] {
  const byDateAmount = new Map<string, typeof existingIncome>();
  for (const e of existingIncome) {
    const dk = safeDbDateKey(e.incomeDate);
    const key = `${dk ?? "__no_date__"}|${e.amount}`;
    const arr = byDateAmount.get(key);
    if (arr) arr.push(e);
    else byDateAmount.set(key, [e]);
  }
  return csvRows.map((row) => {
    const rowDateKey = row.date && isValidDateString(row.date) ? row.date : "__no_date__";
    const key = `${rowDateKey}|${row.amount}`;
    const candidates = byDateAmount.get(key);
    if (!candidates || candidates.length === 0) return { potentialDuplicate: false };
    const exact = candidates.find(
      (e) =>
        e.particulars &&
        row.particulars &&
        (e.particulars.toLowerCase().includes(row.particulars.toLowerCase().slice(0, 20)) ||
          row.particulars.toLowerCase().includes(e.particulars.toLowerCase().slice(0, 20)))
    );
    if (exact)
      return {
        potentialDuplicate: true,
        matchConfidence: "exact" as const,
        matchedExpenseId: exact.id,
        matchedExpenseStatus: "income",
        matchedExpenseSource: exact.source,
      };
    return {
      potentialDuplicate: true,
      matchConfidence: "probable" as const,
      matchedExpenseId: candidates[0].id,
      matchedExpenseStatus: "income",
      matchedExpenseSource: candidates[0].source,
    };
  });
}

export type BankStatementAnalyzeResponse = {
  preview: Array<{
    date: string | null;
    dateRaw: string;
    particulars: string;
    amount: number;
    majorHead: string;
    branch: string;
    categoryMatch: string;
    potentialDuplicate?: boolean;
    matchConfidence?: "exact" | "probable";
    matchedExpenseId?: string;
    matchedExpenseStatus?: string;
    matchedExpenseSource?: string;
  }>;
  totalRows: number;
  totalAmount: number;
  incomePreview: Array<{
    date: string | null;
    dateRaw: string;
    particulars: string;
    amount: number;
    majorHead: string;
    branch: string;
    categoryMatch: string;
    potentialDuplicate?: boolean;
    matchConfidence?: "exact" | "probable";
    matchedExpenseId?: string;
    matchedExpenseSource?: string;
  }>;
  incomeTotalRows: number;
  incomeTotalAmount: number;
  skippedZero: number;
  suggestedExpenseMappings: Record<string, string>;
  suggestedIncomeMappings: Record<string, string>;
  proposedNewCategories: Array<{
    name: string;
    slug: string;
    reason: string;
    type: "expense" | "income";
    rowIndices?: number[];
  }>;
};

export async function runBankStatementImportAnalyze(
  db: typeof drizzleDb,
  tid: string,
  buffer: Buffer
): Promise<BankStatementAnalyzeResponse> {
  const expCats = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name, slug: expenseCategories.slug })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
  const incCats = await db
    .select({ id: incomeCategories.id, name: incomeCategories.name, slug: incomeCategories.slug })
    .from(incomeCategories)
    .where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));
  const expSlugs = expCats.map((c) => c.slug);
  const incSlugs = incCats.length > 0 ? incCats.map((c) => c.slug) : ["other"];

  const { expenses: expRows, income: incRows, skippedZero } = parseBankStatementCsv(buffer, expSlugs, incSlugs);

  const totalExpAmount = expRows.reduce((s, r) => s + r.amount, 0);
  const totalIncAmount = incRows.reduce((s, r) => s + r.amount, 0);

  const { suggestedExpenseMappings, suggestedIncomeMappings, proposedNewCategories } = await analyzeImportSuggestions(
    expRows,
    incRows,
    expCats,
    incCats.length > 0 ? incCats : [{ id: "", name: "Other", slug: "other" }]
  );

  let expDuplicates: DuplicateInfo[] = [];
  let incDuplicates: DuplicateInfo[] = [];
  const expDateRange = getDateRange(expRows);
  const incDateRange = getDateRange(incRows);
  if (expDateRange && isValidDateString(expDateRange.minDate) && isValidDateString(expDateRange.maxDate)) {
    const minD = new Date(expDateRange.minDate + "T00:00:00Z");
    const maxD = new Date(expDateRange.maxDate + "T23:59:59Z");
    if (!Number.isNaN(minD.getTime()) && !Number.isNaN(maxD.getTime())) {
      minD.setUTCDate(minD.getUTCDate() - 1);
      maxD.setUTCDate(maxD.getUTCDate() + 1);
      const existingExp = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          description: expenses.description,
          vendorName: expenses.vendorName,
          status: expenses.status,
          source: expenses.source,
        })
        .from(expenses)
        .where(and(eq(expenses.tenantId, tid), gte(expenses.expenseDate, minD), lte(expenses.expenseDate, maxD)));
      expDuplicates = findDuplicateExpenses(expRows, existingExp);
    }
  }
  if (incDateRange && isValidDateString(incDateRange.minDate) && isValidDateString(incDateRange.maxDate)) {
    const minD = new Date(incDateRange.minDate + "T00:00:00Z");
    const maxD = new Date(incDateRange.maxDate + "T23:59:59Z");
    if (!Number.isNaN(minD.getTime()) && !Number.isNaN(maxD.getTime())) {
      minD.setUTCDate(minD.getUTCDate() - 1);
      maxD.setUTCDate(maxD.getUTCDate() + 1);
      const existingInc = await db
        .select({
          id: incomeRecords.id,
          amount: incomeRecords.amount,
          incomeDate: incomeRecords.incomeDate,
          particulars: incomeRecords.particulars,
          source: incomeRecords.source,
        })
        .from(incomeRecords)
        .where(and(eq(incomeRecords.tenantId, tid), gte(incomeRecords.incomeDate, minD), lte(incomeRecords.incomeDate, maxD)));
      incDuplicates = findDuplicateIncome(incRows, existingInc);
    }
  }

  return {
    preview: expRows.map((r, i) => ({
      date: r.date,
      dateRaw: r.dateRaw ?? "",
      particulars: r.particulars,
      amount: r.amount,
      majorHead: r.majorHead ?? "",
      branch: r.branch ?? "",
      categoryMatch: r.categoryMatch,
      ...(expDuplicates[i] ?? {}),
    })),
    totalRows: expRows.length,
    totalAmount: totalExpAmount,
    incomePreview: incRows.map((r, i) => ({
      date: r.date,
      dateRaw: r.dateRaw ?? "",
      particulars: r.particulars,
      amount: r.amount,
      majorHead: r.majorHead ?? "",
      branch: r.branch ?? "",
      categoryMatch: r.categoryMatch,
      ...(incDuplicates[i] ?? {}),
    })),
    incomeTotalRows: incRows.length,
    incomeTotalAmount: totalIncAmount,
    skippedZero,
    suggestedExpenseMappings,
    suggestedIncomeMappings,
    proposedNewCategories,
  };
}
