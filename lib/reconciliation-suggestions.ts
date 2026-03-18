/**
 * AI-powered reconciliation suggestions using Gemini.
 * Suggests matches between bank transactions and expenses/income records.
 */

import { GoogleGenAI } from "@google/genai";

export type BankTxnRecord = {
  id: string;
  amount: number;
  type: string;
  transactionDate: string;
  particulars?: string | null;
};

export type ExpenseRecord = {
  id: string;
  amount: number;
  expenseDate: string;
  vendorName?: string | null;
  description?: string | null;
  particulars?: string | null;
};

export type IncomeRecord = {
  id: string;
  amount: number;
  incomeDate: string;
  particulars?: string | null;
};

export type BankReconciliationSuggestion = {
  bankTransactionId: string;
  expenseId?: string;
  incomeId?: string;
  bankAmount: number;
  matchedAmount: number;
  reason: string;
  confidence: "high" | "medium" | "low";
};

const BANK_RECON_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bankTransactionId: { type: "string" },
          expenseId: { type: "string" },
          incomeId: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["bankTransactionId", "reason", "confidence"],
      },
    },
  },
  required: ["suggestions"],
} as const;

let ai: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI | null {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Suggest matches between unmatched bank transactions and unmatched expenses/income using Gemini.
 */
export async function suggestBankReconciliationMatches(
  bankTxns: BankTxnRecord[],
  expenseRecords: ExpenseRecord[],
  incomeRecords: IncomeRecord[]
): Promise<BankReconciliationSuggestion[]> {
  const gemini = getGemini();
  if (!gemini) return [];
  if (bankTxns.length === 0 || (expenseRecords.length === 0 && incomeRecords.length === 0)) return [];

  const bankSample = bankTxns.slice(0, 50).map((r) => ({
    id: r.id,
    amount: r.amount,
    type: r.type,
    date: r.transactionDate,
    particulars: r.particulars ?? "",
  }));

  const expenseSample = expenseRecords.slice(0, 50).map((r) => ({
    id: r.id,
    amount: r.amount,
    date: r.expenseDate,
    vendor: r.vendorName ?? "",
    description: r.description ?? r.particulars ?? "",
  }));

  const incomeSample = incomeRecords.slice(0, 50).map((r) => ({
    id: r.id,
    amount: r.amount,
    date: r.incomeDate,
    particulars: r.particulars ?? "",
  }));

  const prompt = `You are a bank reconciliation assistant. Match UNMATCHED BANK TRANSACTIONS to UNMATCHED EXPENSES or UNMATCHED INCOME records.

A debit bank transaction should match an expense. A credit bank transaction should match an income record.

UNMATCHED BANK TRANSACTIONS:
${JSON.stringify(bankSample, null, 2)}

UNMATCHED EXPENSES:
${JSON.stringify(expenseSample, null, 2)}

UNMATCHED INCOME:
${JSON.stringify(incomeSample, null, 2)}

RULES:
1. Match by: same or very close amount (within 1%), similar dates (within 7 days), or matching particulars/vendor/description.
2. Debit bank transactions match expenses. Credit bank transactions match income.
3. Return only high-confidence or medium-confidence matches.
4. Each bank transaction, expense, or income can appear in at most one suggestion.
5. Use the exact "id" values from the data.
6. For each suggestion, provide bankTransactionId plus either expenseId or incomeId (not both).

Return JSON with "suggestions" array. Each item: bankTransactionId, expenseId (optional), incomeId (optional), reason (brief), confidence (high/medium/low).`;

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: BANK_RECON_SCHEMA as any,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return [];

    const parsed = JSON.parse(text) as {
      suggestions: Array<{
        bankTransactionId: string;
        expenseId?: string;
        incomeId?: string;
        reason: string;
        confidence: string;
      }>;
    };

    const bankById = new Map(bankTxns.map((r) => [r.id, r]));
    const expById = new Map(expenseRecords.map((r) => [r.id, r]));
    const incById = new Map(incomeRecords.map((r) => [r.id, r]));

    return (parsed.suggestions ?? [])
      .filter((s) => {
        if (!bankById.has(s.bankTransactionId)) return false;
        if (s.expenseId && !expById.has(s.expenseId)) return false;
        if (s.incomeId && !incById.has(s.incomeId)) return false;
        if (!s.expenseId && !s.incomeId) return false;
        return true;
      })
      .map((s) => {
        const bt = bankById.get(s.bankTransactionId)!;
        const matchedAmount = s.expenseId
          ? expById.get(s.expenseId)!.amount
          : incById.get(s.incomeId!)!.amount;
        return {
          bankTransactionId: s.bankTransactionId,
          expenseId: s.expenseId,
          incomeId: s.incomeId,
          bankAmount: bt.amount,
          matchedAmount,
          reason: s.reason,
          confidence: s.confidence as "high" | "medium" | "low",
        };
      });
  } catch {
    return [];
  }
}
