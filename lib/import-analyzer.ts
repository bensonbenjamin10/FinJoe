/**
 * AI-powered analysis of bank statement CSV for import category suggestions.
 * Uses Gemini to suggest category mappings and propose new categories.
 * Supports chunked analysis for 10K+ rows: parse first, chunk (500-1000 rows), send each to AI with dataset summary.
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

const CHUNK_SIZE = 500;
const DATASET_SUMMARY_MAX_PARTICULARS = 80;

const CONSOLIDATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    proposedNewCategories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          slug: { type: "string" },
          reason: { type: "string" },
          type: { type: "string", enum: ["expense", "income"] },
          rowIndices: { type: "array", items: { type: "number" } },
        },
        required: ["name", "slug", "reason", "type"],
      },
    },
  },
  required: ["proposedNewCategories"],
} as const;

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
 * Build a dataset summary for cross-chunk context (unique particulars patterns).
 */
function buildDatasetSummary(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[]
): { uniqueParticularsSample: string[] } {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const r of [...expenseRows, ...incomeRows]) {
    const p = (r.particulars?.trim() || "").slice(0, 60);
    if (p && !seen.has(p)) {
      seen.add(p);
      sample.push(p);
      if (sample.length >= DATASET_SUMMARY_MAX_PARTICULARS) break;
    }
  }
  return { uniqueParticularsSample: sample };
}

/**
 * Analyze a single chunk of expense/income rows. Indices are global (baseIndex + local index).
 */
async function analyzeChunk(
  gemini: GoogleGenAI,
  expenseChunk: ParsedExpenseRow[],
  incomeChunk: ParsedIncomeRow[],
  expBaseIndex: number,
  incBaseIndex: number,
  datasetSummary: { uniqueParticularsSample: string[] },
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[]
): Promise<AnalyzeImportResult> {
  const expCatList = expenseCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");
  const incCatList =
    incomeCategories.length > 0
      ? incomeCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ")
      : "other (slug: other)";

  const expenseSample = expenseChunk.map((r, i) => ({
    index: expBaseIndex + i,
    date: r.date,
    particulars: r.particulars,
    amount: r.amount,
    branch: r.branch ?? "",
  }));

  const incomeSample = incomeChunk.map((r, i) => ({
    index: incBaseIndex + i,
    date: r.date,
    particulars: r.particulars,
    amount: r.amount,
  }));

  const summaryText =
    datasetSummary.uniqueParticularsSample.length > 0
      ? `\n\nDATASET SUMMARY (sample of particulars across full dataset):\n${JSON.stringify(datasetSummary.uniqueParticularsSample.slice(0, 40))}`
      : "";

  const prompt = `You are analyzing a bank statement CSV for expense and income import. Suggest the best category for each row.

AVAILABLE EXPENSE CATEGORIES (use slug): ${expCatList || "miscellaneous (slug: miscellaneous)"}
AVAILABLE INCOME CATEGORIES (use slug): ${incCatList}

EXPENSE ROWS (index = row position in the FULL parsed list - use these exact indices in your response):
${JSON.stringify(expenseSample, null, 2)}

INCOME ROWS (index = row position in the FULL parsed list - use these exact indices in your response):
${JSON.stringify(incomeSample, null, 2)}
${summaryText}

RULES:
1. For each expense row, suggest an expense category slug. Map row index (as string key) to slug.
2. For each income row, suggest an income category slug.
3. If a row clearly doesn't fit any existing category (e.g. many "Salary-*" rows but no payroll category), propose a NEW category in proposedNewCategories with name, slug, reason, type ("expense" or "income"), and rowIndices.
4. Use only slugs from the available categories unless proposing new ones.
5. For salary, payroll, wages: use "miscellaneous" if no payroll category exists, OR propose "Payroll" as new.
6. Keep proposed new categories minimal—only when there's a clear pattern (e.g. 5+ rows) that doesn't fit.

Return JSON with suggestedExpenseMappings, suggestedIncomeMappings, and proposedNewCategories.`;

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
    return { suggestedExpenseMappings: {}, suggestedIncomeMappings: {}, proposedNewCategories: [] };
  }

  const parsed = JSON.parse(text) as AnalyzeImportResult;
  return {
    suggestedExpenseMappings: parsed.suggestedExpenseMappings ?? {},
    suggestedIncomeMappings: parsed.suggestedIncomeMappings ?? {},
    proposedNewCategories: Array.isArray(parsed.proposedNewCategories) ? parsed.proposedNewCategories : [],
  };
}

/**
 * Analyze parsed CSV rows and suggest category mappings using Gemini.
 * Uses chunked analysis (500 rows per chunk) for scalability; supports 10K+ rows.
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

  const incCats = incomeCategories.length > 0 ? incomeCategories : [{ id: "", name: "Other", slug: "other" }];
  const datasetSummary = buildDatasetSummary(expenseRows, incomeRows);

  const expChunks: { rows: ParsedExpenseRow[]; baseIndex: number }[] = [];
  for (let i = 0; i < expenseRows.length; i += CHUNK_SIZE) {
    expChunks.push({ rows: expenseRows.slice(i, i + CHUNK_SIZE), baseIndex: i });
  }

  const incChunks: { rows: ParsedIncomeRow[]; baseIndex: number }[] = [];
  for (let i = 0; i < incomeRows.length; i += CHUNK_SIZE) {
    incChunks.push({ rows: incomeRows.slice(i, i + CHUNK_SIZE), baseIndex: i });
  }

  const maxChunks = Math.max(expChunks.length, incChunks.length, 1);
  const merged: AnalyzeImportResult = {
    suggestedExpenseMappings: {},
    suggestedIncomeMappings: {},
    proposedNewCategories: [],
  };

  for (let c = 0; c < maxChunks; c++) {
    const expChunk = expChunks[c] ?? { rows: [], baseIndex: 0 };
    const incChunk = incChunks[c] ?? { rows: [], baseIndex: 0 };
    if (expChunk.rows.length === 0 && incChunk.rows.length === 0) continue;

    try {
      const result = await analyzeChunk(
        gemini,
        expChunk.rows,
        incChunk.rows,
        expChunk.baseIndex,
        incChunk.baseIndex,
        datasetSummary,
        expenseCategories,
        incCats
      );

      Object.assign(merged.suggestedExpenseMappings, result.suggestedExpenseMappings);
      Object.assign(merged.suggestedIncomeMappings, result.suggestedIncomeMappings);
      merged.proposedNewCategories.push(...result.proposedNewCategories);
    } catch (e) {
      console.error("Import chunk analysis failed", { chunkIndex: c, err: e });
    }
  }

  if (Object.keys(merged.suggestedExpenseMappings).length === 0 && Object.keys(merged.suggestedIncomeMappings).length === 0) {
    return merged;
  }

  const consolidated = await runConsolidationPass(
    gemini,
    merged,
    expenseRows,
    incomeRows,
    expenseCategories,
    incCats
  );

  return consolidated;
}

/**
 * Consolidation pass: after merging chunk results, run a second AI call to propose new categories
 * from the combined mappings (e.g. "Payroll" when salary rows were split across chunks).
 */
async function runConsolidationPass(
  gemini: GoogleGenAI,
  merged: AnalyzeImportResult,
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[],
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[]
): Promise<AnalyzeImportResult> {
  const existingSlugs = new Set([
    ...expenseCategories.map((c) => c.slug),
    ...incomeCategories.map((c) => c.slug),
  ]);
  const alreadyProposed = new Set(merged.proposedNewCategories.map((p) => p.slug));

  const expSlugCounts: Record<string, { count: number; sampleParticulars: string[] }> = {};
  for (const [idx, slug] of Object.entries(merged.suggestedExpenseMappings)) {
    const r = expenseRows[parseInt(idx, 10)];
    if (!r) continue;
    if (!expSlugCounts[slug]) expSlugCounts[slug] = { count: 0, sampleParticulars: [] };
    expSlugCounts[slug].count++;
    if (expSlugCounts[slug].sampleParticulars.length < 5) {
      expSlugCounts[slug].sampleParticulars.push(r.particulars?.slice(0, 50) ?? "");
    }
  }

  const incSlugCounts: Record<string, { count: number; sampleParticulars: string[] }> = {};
  for (const [idx, slug] of Object.entries(merged.suggestedIncomeMappings)) {
    const r = incomeRows[parseInt(idx, 10)];
    if (!r) continue;
    if (!incSlugCounts[slug]) incSlugCounts[slug] = { count: 0, sampleParticulars: [] };
    incSlugCounts[slug].count++;
    if (incSlugCounts[slug].sampleParticulars.length < 5) {
      incSlugCounts[slug].sampleParticulars.push(r.particulars?.slice(0, 50) ?? "");
    }
  }

  const summary = {
    expenseCategoryUsage: expSlugCounts,
    incomeCategoryUsage: incSlugCounts,
    totalExpenseRows: expenseRows.length,
    totalIncomeRows: incomeRows.length,
  };

  const prompt = `You are reviewing category mappings from a chunked bank statement import (${expenseRows.length} expenses, ${incomeRows.length} income).

EXISTING CATEGORIES (do not propose these): ${[...existingSlugs].join(", ")}
ALREADY PROPOSED BY CHUNKS (do not duplicate): ${[...alreadyProposed].join(", ")}

CATEGORY USAGE SUMMARY (slug -> count and sample particulars):
${JSON.stringify(summary, null, 2)}

Look for patterns that suggest a NEW category would be useful. For example:
- Many rows mapped to "miscellaneous" with particulars like "Salary- Jan", "Salary- Feb" -> propose "Payroll"
- Many rows with "UPI/", "NEFT" mapped to travel -> consider if "Bank Transfer" or similar makes sense

Only propose 0-3 new categories. Each must have: name, slug, reason, type ("expense" or "income"), and rowIndices (array of row indices that would use it).
Return JSON: { "proposedNewCategories": [...] }`;

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CONSOLIDATION_RESPONSE_SCHEMA,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return merged;

    const parsed = JSON.parse(text) as { proposedNewCategories?: AnalyzeImportResult["proposedNewCategories"] };
    const extra = Array.isArray(parsed.proposedNewCategories) ? parsed.proposedNewCategories : [];

    for (const p of extra) {
      if (existingSlugs.has(p.slug) || alreadyProposed.has(p.slug)) continue;
      merged.proposedNewCategories.push(p);
      alreadyProposed.add(p.slug);
    }
  } catch {
    // Consolidation failed; return merged as-is.
  }

  return merged;
}
