/**
 * Standardized accounting export rows for Tally XML, Zoho CSV, and API sync.
 * Amounts are in paise (minor units) unless noted.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import {
  expenses,
  expenseCategories,
  incomeRecords,
  incomeCategories,
  costCenters,
  vendors,
} from "../../shared/schema.js";

export type AccountingExportExpenseRow = {
  kind: "expense";
  id: string;
  expenseDate: string | null;
  amountPaise: number;
  status: string;
  vendorId: string | null;
  vendorName: string | null;
  gstin: string | null;
  taxType: string | null;
  baseAmountPaise: number | null;
  taxAmountPaise: number | null;
  taxRatePercent: number | null;
  categoryId: string;
  categoryName: string | null;
  costCenterName: string | null;
  description: string | null;
  particulars: string | null;
  invoiceNumber: string | null;
  payoutMethod: string | null;
  payoutAt: Date | null;
};

export type AccountingExportIncomeRow = {
  kind: "income";
  id: string;
  incomeDate: string | null;
  amountPaise: number;
  incomeType: string;
  particulars: string | null;
  categoryId: string | null;
  categoryName: string | null;
  costCenterName: string | null;
  source: string;
};

export type AccountingExportRow = AccountingExportExpenseRow | AccountingExportIncomeRow;

export type AccountingExportOptions = {
  tenantId: string;
  /** Inclusive YYYY-MM-DD */
  fromDate: string;
  /** Inclusive YYYY-MM-DD */
  toDate: string;
  /** If true, only approved/paid expenses; default includes all non-void statuses */
  approvedOnly?: boolean;
  includeIncome?: boolean;
  includeExpenses?: boolean;
};

function toYmd(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

/**
 * Load expenses and optional income in date range for export / sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildAccountingExport(db: any, opts: AccountingExportOptions): Promise<AccountingExportRow[]> {
  const {
    tenantId,
    fromDate,
    toDate,
    approvedOnly = false,
    includeIncome = true,
    includeExpenses = true,
  } = opts;

  const rows: AccountingExportRow[] = [];

  if (includeExpenses) {
    const conds = [
      eq(expenses.tenantId, tenantId),
      sql`${expenses.expense_date}::date >= ${fromDate}::date`,
      sql`${expenses.expense_date}::date <= ${toDate}::date`,
    ];
    if (approvedOnly) {
      conds.push(sql`${expenses.status} IN ('approved', 'paid')`);
    }

    const expRows = await db
      .select({
        id: expenses.id,
        expenseDate: expenses.expenseDate,
        amount: expenses.amount,
        status: expenses.status,
        vendorId: expenses.vendorId,
        vendorName: expenses.vendorName,
        gstin: expenses.gstin,
        taxType: expenses.taxType,
        baseAmount: expenses.baseAmount,
        taxAmount: expenses.taxAmount,
        taxRate: expenses.taxRate,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        costCenterName: costCenters.name,
        description: expenses.description,
        particulars: expenses.particulars,
        invoiceNumber: expenses.invoiceNumber,
        payoutMethod: expenses.payoutMethod,
        payoutAt: expenses.payoutAt,
        vendorMasterName: vendors.name,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
      .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(desc(expenses.expenseDate));

    for (const e of expRows) {
      const displayVendor = (e.vendorMasterName as string | null) ?? (e.vendorName as string | null);
      rows.push({
        kind: "expense",
        id: e.id as string,
        expenseDate: toYmd(e.expenseDate),
        amountPaise: e.amount as number,
        status: e.status as string,
        vendorId: (e.vendorId as string | null) ?? null,
        vendorName: displayVendor,
        gstin: (e.gstin as string | null) ?? null,
        taxType: (e.taxType as string | null) ?? null,
        baseAmountPaise: (e.baseAmount as number | null) ?? null,
        taxAmountPaise: (e.taxAmount as number | null) ?? null,
        taxRatePercent: (e.taxRate as number | null) ?? null,
        categoryId: e.categoryId as string,
        categoryName: (e.categoryName as string | null) ?? null,
        costCenterName: (e.costCenterName as string | null) ?? null,
        description: (e.description as string | null) ?? null,
        particulars: (e.particulars as string | null) ?? null,
        invoiceNumber: (e.invoiceNumber as string | null) ?? null,
        payoutMethod: (e.payoutMethod as string | null) ?? null,
        payoutAt: (e.payoutAt as Date | null) ?? null,
      });
    }
  }

  if (includeIncome) {
    const incRows = await db
      .select({
        id: incomeRecords.id,
        incomeDate: incomeRecords.incomeDate,
        amount: incomeRecords.amount,
        incomeType: incomeRecords.incomeType,
        particulars: incomeRecords.particulars,
        categoryId: incomeRecords.categoryId,
        categoryName: incomeCategories.name,
        costCenterName: costCenters.name,
        source: incomeRecords.source,
      })
      .from(incomeRecords)
      .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
      .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
      .where(
        and(
          eq(incomeRecords.tenantId, tenantId),
          sql`${incomeRecords.income_date}::date >= ${fromDate}::date`,
          sql`${incomeRecords.income_date}::date <= ${toDate}::date`,
        ),
      )
      .orderBy(desc(incomeRecords.incomeDate));

    for (const r of incRows) {
      rows.push({
        kind: "income",
        id: r.id as string,
        incomeDate: toYmd(r.incomeDate),
        amountPaise: r.amount as number,
        incomeType: (r.incomeType as string) ?? "other",
        particulars: (r.particulars as string | null) ?? null,
        categoryId: (r.categoryId as string | null) ?? null,
        categoryName: (r.categoryName as string | null) ?? null,
        costCenterName: (r.costCenterName as string | null) ?? null,
        source: (r.source as string) ?? "manual",
      });
    }
  }

  return rows;
}

/** Paise → rupees string with 2 decimals */
export function paiseToRupeesStr(paise: number): string {
  return (paise / 100).toFixed(2);
}
