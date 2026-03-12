/**
 * AI-powered reconciliation suggestions using Gemini.
 * Suggests plausible matches between income and expense records.
 */

import { GoogleGenAI } from "@google/genai";

export type IncomeRecord = { id: string; amount: number; incomeDate: string; particulars?: string | null; categoryName?: string };
export type ExpenseRecord = { id: string; amount: number; expenseDate: string; vendorName?: string | null; description?: string | null; particulars?: string | null };

export type ReconciliationSuggestion = {
  incomeId: string;
  expenseId: string;
  incomeAmount: number;
  expenseAmount: number;
  reason: string;
  confidence: "high" | "medium" | "low";
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          incomeId: { type: "string" },
          expenseId: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["incomeId", "expenseId", "reason", "confidence"],
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
 * Suggest matches between income and expense records using Gemini.
 * Returns empty array if GEMINI_API_KEY is missing or API fails.
 */
export async function suggestReconciliationMatches(
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[]
): Promise<ReconciliationSuggestion[]> {
  const gemini = getGemini();
  if (!gemini) return [];

  if (incomeRecords.length === 0 || expenseRecords.length === 0) return [];

  const incomeSample = incomeRecords.slice(0, 50).map((r) => ({
    id: r.id,
    amount: r.amount,
    date: r.incomeDate,
    particulars: r.particulars ?? "",
    category: r.categoryName ?? "",
  }));

  const expenseSample = expenseRecords.slice(0, 50).map((r) => ({
    id: r.id,
    amount: r.amount,
    date: r.expenseDate,
    vendor: r.vendorName ?? "",
    description: r.description ?? r.particulars ?? "",
  }));

  const prompt = `You are a finance reconciliation assistant. Suggest plausible matches between INCOME and EXPENSE records. A match means: income received might correspond to an expense paid (e.g. fee received matches salary paid, or refund matches prior expense).

INCOME RECORDS:
${JSON.stringify(incomeSample, null, 2)}

EXPENSE RECORDS (all are paid):
${JSON.stringify(expenseSample, null, 2)}

RULES:
1. Match by: same or very close amount (within 1%), similar dates (within 30 days), or matching particulars/vendor/description.
2. Return only high-confidence or medium-confidence matches. Skip low-value guesses.
3. Each income or expense can appear in at most one suggestion.
4. Use the exact "id" values from the data.
5. Keep suggestions minimal - only when there's a clear link (e.g. "Fee received ₹50,000" and "Salary expense ₹50,000" on similar dates).

Return JSON with "suggestions" array. Each item: incomeId, expenseId, reason (brief explanation), confidence (high/medium/low).`;

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA as any,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return [];

    const parsed = JSON.parse(text) as { suggestions: Array<{ incomeId: string; expenseId: string; reason: string; confidence: string }> };
    const incomeById = new Map(incomeRecords.map((r) => [r.id, r]));
    const expenseById = new Map(expenseRecords.map((r) => [r.id, r]));

    return (parsed.suggestions ?? [])
      .filter((s) => incomeById.has(s.incomeId) && expenseById.has(s.expenseId))
      .map((s) => {
        const inc = incomeById.get(s.incomeId)!;
        const exp = expenseById.get(s.expenseId)!;
        return {
          incomeId: s.incomeId,
          expenseId: s.expenseId,
          incomeAmount: inc.amount,
          expenseAmount: exp.amount,
          reason: s.reason,
          confidence: s.confidence as "high" | "medium" | "low",
        };
      });
  } catch {
    return [];
  }
}
