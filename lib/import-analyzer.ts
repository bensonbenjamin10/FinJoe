/**
 * AI-powered analysis of bank statement CSV for import category suggestions.
 * Uses Gemini to suggest category mappings and propose new categories.
 */

import { GoogleGenAI } from "@google/genai";
import type { ParsedExpenseRow, ParsedIncomeRow } from "./bank-statement-parser.js";

export type CategoryInfo = { id: string; name: string; slug: string };

export type AnalyzeImportResult = {
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

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    suggestedExpenseMappings: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Map expense row index (as string) to category slug",
    },
    suggestedIncomeMappings: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Map income row index (as string) to category slug",
    },
    proposedNewCategories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Display name for the category" },
          slug: { type: "string", description: "URL-safe slug (lowercase, underscores)" },
          reason: { type: "string", description: "Why this category is suggested" },
          type: { type: "string", enum: ["expense", "income"] },
          rowIndices: {
            type: "array",
            items: { type: "number" },
            description: "Row indices that would use this category",
          },
        },
        required: ["name", "slug", "reason", "type"],
      },
      description: "New categories to propose when data doesn't fit existing ones",
    },
  },
  required: ["suggestedExpenseMappings", "suggestedIncomeMappings", "proposedNewCategories"],
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
 * Analyze parsed CSV rows and suggest category mappings using Gemini.
 * Returns empty suggestions if GEMINI_API_KEY is missing or API fails.
 */
export async function analyzeImportSuggestions(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[],
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[]
): Promise<AnalyzeImportResult> {
  const gemini = getGemini();
  if (!gemini) {
    return {
      suggestedExpenseMappings: {},
      suggestedIncomeMappings: {},
      proposedNewCategories: [],
    };
  }

  const expCatList = expenseCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");
  const incCatList =
    incomeCategories.length > 0
      ? incomeCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ")
      : "other (slug: other)";

  const expenseSample = expenseRows.slice(0, 50).map((r, i) => ({
    index: i,
    date: r.date,
    particulars: r.particulars,
    amount: r.amount,
    branch: r.branch ?? "",
  }));

  const incomeSample = incomeRows.slice(0, 50).map((r, i) => ({
    index: i,
    date: r.date,
    particulars: r.particulars,
    amount: r.amount,
  }));

  const prompt = `You are analyzing a bank statement CSV for expense and income import. Suggest the best category for each row.

AVAILABLE EXPENSE CATEGORIES (use slug): ${expCatList || "miscellaneous (slug: miscellaneous)"}
AVAILABLE INCOME CATEGORIES (use slug): ${incCatList}

EXPENSE ROWS (index = row position in the parsed list):
${JSON.stringify(expenseSample, null, 2)}

INCOME ROWS (index = row position in the parsed list):
${JSON.stringify(incomeSample, null, 2)}

RULES:
1. For each expense row, suggest an expense category slug. Map row index (as string key) to slug.
2. For each income row, suggest an income category slug.
3. If a row clearly doesn't fit any existing category (e.g. many "Salary-*" rows but no payroll category), propose a NEW category in proposedNewCategories with name, slug, reason, type ("expense" or "income"), and rowIndices.
4. Use only slugs from the available categories unless proposing new ones.
5. For salary, payroll, wages: use "miscellaneous" if no payroll category exists, OR propose "Payroll" as new.
6. Keep proposed new categories minimal—only when there's a clear pattern (e.g. 5+ rows) that doesn't fit.

Return JSON with suggestedExpenseMappings, suggestedIncomeMappings, and proposedNewCategories.`;

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) {
      return {
        suggestedExpenseMappings: {},
        suggestedIncomeMappings: {},
        proposedNewCategories: [],
      };
    }

    const parsed = JSON.parse(text) as AnalyzeImportResult;
    return {
      suggestedExpenseMappings: parsed.suggestedExpenseMappings ?? {},
      suggestedIncomeMappings: parsed.suggestedIncomeMappings ?? {},
      proposedNewCategories: Array.isArray(parsed.proposedNewCategories)
        ? parsed.proposedNewCategories
        : [],
    };
  } catch {
    return {
      suggestedExpenseMappings: {},
      suggestedIncomeMappings: {},
      proposedNewCategories: [],
    };
  }
}
