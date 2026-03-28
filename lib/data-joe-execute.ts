/**
 * Persist dataJoe universal import (parsed rows + overrides).
 */

import crypto from "node:crypto";
import { eq, and, or, isNull } from "drizzle-orm";
import type { ParsedExpenseRow, ParsedIncomeRow } from "./bank-statement-parser.js";
import { isValidDateString } from "./bank-statement-parser.js";
import { expenses, expenseCategories, incomeCategories, incomeRecords, bankTransactions, costCenters } from "../shared/schema.js";
import { db as drizzleDb } from "../server/db.js";

export type DataJoeExecuteBody = {
  destination: "bank_transactions" | "expenses" | "income_records" | "mixed";
  expenseRows: ParsedExpenseRow[];
  incomeRows: ParsedIncomeRow[];
  expenseOverrides: Record<string, string>;
  incomeOverrides: Record<string, string>;
  costCenterOverrides: Record<string, string | null>;
  incomeCostCenterOverrides: Record<string, string | null>;
  skipExpenseIndices: number[];
  skipIncomeIndices: number[];
};

export async function executeDataJoeImport(
  database: typeof drizzleDb,
  tid: string,
  body: DataJoeExecuteBody
): Promise<{ imported: number; incomeImported: number; bankOnly?: number }> {
  const {
    destination,
    expenseRows: expRows,
    incomeRows: incRows,
    expenseOverrides,
    incomeOverrides,
    costCenterOverrides,
    incomeCostCenterOverrides,
    skipExpenseIndices,
    skipIncomeIndices,
  } = body;

  const skipExp = new Set(skipExpenseIndices ?? []);
  const skipInc = new Set(skipIncomeIndices ?? []);

  const expCats = await database
    .select({ id: expenseCategories.id, slug: expenseCategories.slug })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
  const incCats = await database
    .select({ id: incomeCategories.id, slug: incomeCategories.slug })
    .from(incomeCategories)
    .where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));

  const validExpCatIds = new Set(expCats.map((c) => c.id));
  const validIncCatIds = new Set(incCats.map((c) => c.id));
  const costCentersList = await database
    .select({ id: costCenters.id, name: costCenters.name, slug: costCenters.slug })
    .from(costCenters)
    .where(and(eq(costCenters.tenantId, tid), eq(costCenters.isActive, true)));
  const validCcIds = new Set(costCentersList.map((c) => c.id));

  const expSlugToId = Object.fromEntries(expCats.map((c) => [c.slug, c.id]));
  const incSlugToId = Object.fromEntries(incCats.map((c) => [c.slug, c.id]));

  const branchToCcId = (name: string | undefined): string | null => {
    if (!name?.trim()) return null;
    const n = name.trim().toLowerCase();
    const match = costCentersList.find((c) => c.name.toLowerCase() === n || c.slug.toLowerCase() === n);
    return match?.id ?? null;
  };

  const toDate = (dateStr: string): Date => {
    const d = new Date(dateStr + "T12:00:00Z");
    if (isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dateStr}`);
    return d;
  };

  if (expRows.length > 0 && expCats.length === 0 && destination !== "bank_transactions" && destination !== "income_records") {
    throw new Error("Expense rows found but no expense categories.");
  }
  if (incRows.length > 0 && incCats.length === 0 && destination !== "bank_transactions" && destination !== "expenses") {
    throw new Error("Income rows found but no income categories.");
  }

  const importBatchId = crypto.randomUUID();
  const BATCH_SIZE = 250;

  /** Raw bank lines only (reconciliation import style). */
  if (destination === "bank_transactions") {
    const bankTxnInserts: Array<{
      tenantId: string;
      transactionDate: Date | null;
      particulars: string;
      amount: number;
      type: string;
      importBatchId: string;
    }> = [];

    for (let i = 0; i < expRows.length; i++) {
      const r = expRows[i];
      if (skipExp.has(i)) continue;
      if (r.date == null || !isValidDateString(r.date)) continue;
      bankTxnInserts.push({
        tenantId: tid,
        transactionDate: toDate(r.date),
        particulars: r.particulars || "dataJoe import",
        amount: r.amount,
        type: "debit",
        importBatchId,
      });
    }
    for (let i = 0; i < incRows.length; i++) {
      const r = incRows[i];
      if (skipInc.has(i)) continue;
      if (r.date == null || !isValidDateString(r.date)) continue;
      bankTxnInserts.push({
        tenantId: tid,
        transactionDate: toDate(r.date),
        particulars: r.particulars || "dataJoe import",
        amount: r.amount,
        type: "credit",
        importBatchId,
      });
    }

    let bankOnly = 0;
    if (bankTxnInserts.length > 0) {
      await database.transaction(async (tx) => {
        for (let i = 0; i < bankTxnInserts.length; i += BATCH_SIZE) {
          const chunk = bankTxnInserts.slice(i, i + BATCH_SIZE);
          await tx.insert(bankTransactions).values(chunk);
          bankOnly += chunk.length;
        }
      });
    }
    return { imported: 0, incomeImported: 0, bankOnly };
  }

  const expToInsert: Array<{
    tenantId: string;
    costCenterId: string | null;
    categoryId: string;
    amount: number;
    expenseDate: Date | null;
    description: string;
    status: string;
    source: string;
  }> = [];

  const incToInsert: Array<{
    tenantId: string;
    costCenterId: string | null;
    categoryId: string;
    amount: number;
    incomeDate: Date | null;
    particulars: string;
    incomeType: string;
    source: string;
  }> = [];

  if (destination === "expenses" || destination === "mixed") {
    for (let i = 0; i < expRows.length; i++) {
      if (skipExp.has(i)) continue;
      const r = expRows[i];
      const overrideCat = expenseOverrides[String(i)];
      const categoryId =
        (overrideCat && validExpCatIds.has(overrideCat) ? overrideCat : null) ?? expSlugToId[r.categoryMatch] ?? expCats[0]?.id;
      if (!categoryId) continue;
      const overrideCc = costCenterOverrides[String(i)];
      const ccId =
        overrideCc !== undefined
          ? overrideCc === null || overrideCc === "__corporate__"
            ? null
            : validCcIds.has(overrideCc)
              ? overrideCc
              : null
          : branchToCcId(r.branch);
      const expenseDate = r.date != null && isValidDateString(r.date) ? toDate(r.date) : null;
      expToInsert.push({
        tenantId: tid,
        costCenterId: ccId,
        categoryId,
        amount: r.amount,
        expenseDate,
        description: r.particulars || "dataJoe import",
        status: "draft",
        source: "datajoe",
      });
    }
  }

  if (destination === "income_records" || destination === "mixed") {
    const defaultIncCatId = incCats[0]?.id;
    for (let i = 0; i < incRows.length; i++) {
      if (skipInc.has(i)) continue;
      const r = incRows[i];
      const overrideCat = incomeOverrides[String(i)];
      const categoryId =
        (overrideCat && validIncCatIds.has(overrideCat) ? overrideCat : null) ?? incSlugToId[r.categoryMatch] ?? defaultIncCatId;
      if (!categoryId) continue;
      const overrideCc = incomeCostCenterOverrides[String(i)];
      const ccId =
        overrideCc !== undefined
          ? overrideCc === null || overrideCc === "__corporate__"
            ? null
            : validCcIds.has(overrideCc)
              ? overrideCc
              : null
          : branchToCcId(r.branch);
      const incomeDate = r.date != null && isValidDateString(r.date) ? toDate(r.date) : null;
      incToInsert.push({
        tenantId: tid,
        costCenterId: ccId,
        categoryId,
        amount: r.amount,
        incomeDate,
        particulars: r.particulars || "dataJoe import",
        incomeType: "other",
        source: "datajoe",
      });
    }
  }

  let imported = 0;
  let incomeImported = 0;

  const linkBank = destination === "mixed";

  await database.transaction(async (tx) => {
    if (destination === "expenses" || destination === "mixed") {
      for (let i = 0; i < expToInsert.length; i += BATCH_SIZE) {
        const chunk = expToInsert.slice(i, i + BATCH_SIZE);
        const insertedExpenses = await tx.insert(expenses).values(chunk).returning({ id: expenses.id });
        if (linkBank) {
          const bankTxnChunk = insertedExpenses.map((exp, j) => {
            const row = chunk[j];
            return {
              tenantId: tid,
              transactionDate: row.expenseDate,
              particulars: row.description,
              amount: row.amount,
              type: "debit" as const,
              importBatchId,
              reconciliationStatus: "auto_from_import" as const,
              matchedExpenseId: exp.id,
              matchConfidence: "exact" as const,
              matchedAt: new Date(),
            };
          });
          const insertedBankTxns = await tx.insert(bankTransactions).values(bankTxnChunk).returning({ id: bankTransactions.id });
          for (let j = 0; j < insertedBankTxns.length; j++) {
            await tx.update(expenses).set({ bankTransactionId: insertedBankTxns[j].id }).where(eq(expenses.id, insertedExpenses[j].id));
          }
        }
        imported += chunk.length;
      }
    }

    if (destination === "income_records" || destination === "mixed") {
      for (let i = 0; i < incToInsert.length; i += BATCH_SIZE) {
        const chunk = incToInsert.slice(i, i + BATCH_SIZE);
        const insertedIncome = await tx.insert(incomeRecords).values(chunk).returning({ id: incomeRecords.id });
        if (linkBank) {
          const bankTxnChunk = insertedIncome.map((inc, j) => {
            const row = chunk[j];
            return {
              tenantId: tid,
              transactionDate: row.incomeDate,
              particulars: row.particulars,
              amount: row.amount,
              type: "credit" as const,
              importBatchId,
              reconciliationStatus: "auto_from_import" as const,
              matchedIncomeId: inc.id,
              matchConfidence: "exact" as const,
              matchedAt: new Date(),
            };
          });
          const insertedBankTxns = await tx.insert(bankTransactions).values(bankTxnChunk).returning({ id: bankTransactions.id });
          for (let j = 0; j < insertedBankTxns.length; j++) {
            await tx.update(incomeRecords).set({ bankTransactionId: insertedBankTxns[j].id }).where(eq(incomeRecords.id, insertedIncome[j].id));
          }
        }
        incomeImported += chunk.length;
      }
    }
  });

  return { imported, incomeImported };
}
