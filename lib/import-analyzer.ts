/**
 * AI-powered analysis of bank statement CSV for import category suggestions.
 * Uses a single Gemini call with pattern-based rules instead of per-row chunking.
 * Supports 10K+ rows: build rich summary (particulars with counts) → 1 AI call → apply rules locally.
 */

import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
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

const MAX_PARTICULARS_WITH_COUNTS = 150;

const PATTERN_RULES_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    patternRules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Match pattern: prefix (e.g. Salary-) or substring (e.g. UPI). Use * for prefix wildcard." },
          slug: { type: "string", description: "Category slug to map to" },
          type: { type: "string", enum: ["expense", "income"] },
          matchType: { type: "string", enum: ["prefix", "substring"], description: "prefix = particulars starts with pattern; substring = particulars includes pattern" },
        },
        required: ["pattern", "slug", "type", "matchType"],
      },
      description: "Rules to apply: first matching rule wins. Order by specificity (more specific first).",
    },
    proposedNewCategories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          slug: { type: "string" },
          reason: { type: "string" },
          type: { type: "string", enum: ["expense", "income"] },
          pattern: { type: "string", description: "Pattern that identifies rows for this category (e.g. Salary-)" },
          matchType: { type: "string", enum: ["prefix", "substring"] },
        },
        required: ["name", "slug", "reason", "type", "pattern", "matchType"],
      },
    },
  },
  required: ["patternRules", "proposedNewCategories"],
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

function parseGeminiJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.warn("Gemini returned malformed JSON; repaired before parse");
    const repaired = jsonrepair(text);
    return JSON.parse(repaired) as T;
  }
}

type ParticularsWithCounts = Record<string, number>;

/**
 * Build a rich summary: unique particulars with row counts.
 * Enables AI to propose new categories based on frequency (e.g. 33 Salary rows → Payroll).
 */
function buildParticularsWithCounts(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[]
): { expense: ParticularsWithCounts; income: ParticularsWithCounts } {
  const expense: ParticularsWithCounts = {};
  const income: ParticularsWithCounts = {};

  for (const r of expenseRows) {
    const p = (r.particulars?.trim() || "").slice(0, 80);
    if (p) expense[p] = (expense[p] ?? 0) + 1;
  }
  for (const r of incomeRows) {
    const p = (r.particulars?.trim() || "").slice(0, 80);
    if (p) income[p] = (income[p] ?? 0) + 1;
  }

  // Sort by count descending and cap to keep prompt size reasonable
  const sortAndCap = (obj: ParticularsWithCounts): ParticularsWithCounts => {
    const entries = Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PARTICULARS_WITH_COUNTS);
    return Object.fromEntries(entries);
  };

  return { expense: sortAndCap(expense), income: sortAndCap(income) };
}

/**
 * Build a summary of Major Head values with counts.
 * These are category hints from the CSV that the AI should use for better categorization.
 */
function buildMajorHeadCounts(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[]
): { expense: Record<string, number>; income: Record<string, number> } {
  const expense: Record<string, number> = {};
  const income: Record<string, number> = {};
  for (const r of expenseRows) {
    const h = r.majorHead?.trim();
    if (h) expense[h] = (expense[h] ?? 0) + 1;
  }
  for (const r of incomeRows) {
    const h = r.majorHead?.trim();
    if (h) income[h] = (income[h] ?? 0) + 1;
  }
  return { expense, income };
}

/**
 * Try to directly match Major Head values to existing categories by name or slug.
 * Returns pre-resolved mappings for rows where Major Head matches, so AI can focus on the rest.
 */
function preMappFromMajorHead(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[],
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[]
): { expMappings: Record<string, string>; incMappings: Record<string, string> } {
  const expByName = new Map<string, string>();
  const expBySlug = new Map<string, string>();
  for (const c of expenseCategories) {
    expByName.set(c.name.toLowerCase(), c.slug);
    expBySlug.set(c.slug.toLowerCase(), c.slug);
  }
  const incByName = new Map<string, string>();
  const incBySlug = new Map<string, string>();
  for (const c of incomeCategories) {
    incByName.set(c.name.toLowerCase(), c.slug);
    incBySlug.set(c.slug.toLowerCase(), c.slug);
  }

  const expMappings: Record<string, string> = {};
  for (let i = 0; i < expenseRows.length; i++) {
    const h = expenseRows[i].majorHead?.trim().toLowerCase();
    if (!h) continue;
    const match = expByName.get(h) ?? expBySlug.get(h);
    if (match) expMappings[String(i)] = match;
  }

  const incMappings: Record<string, string> = {};
  for (let i = 0; i < incomeRows.length; i++) {
    const h = incomeRows[i].majorHead?.trim().toLowerCase();
    if (!h) continue;
    const match = incByName.get(h) ?? incBySlug.get(h);
    if (match) incMappings[String(i)] = match;
  }

  return { expMappings, incMappings };
}

type PatternRule = { pattern: string; slug: string; type: "expense" | "income"; matchType: "prefix" | "substring" };

function matchesRule(particulars: string, rule: PatternRule): boolean {
  const pat = rule.pattern.toLowerCase().replace(/\*$/, "").trim();
  if (!pat) return false; // empty pattern would match everything
  const p = particulars.toLowerCase();
  if (rule.matchType === "prefix") return p.startsWith(pat);
  return p.includes(pat);
}

/**
 * Apply pattern rules to rows. First matching rule wins.
 * Rules should be ordered by specificity (more specific first).
 */
function applyPatternRules(
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[],
  rules: PatternRule[],
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[],
  defaultExpSlug: string,
  defaultIncSlug: string
): { suggestedExpenseMappings: Record<string, string>; suggestedIncomeMappings: Record<string, string> } {
  const expSlugs = new Set(expenseCategories.map((c) => c.slug));
  const incSlugs = new Set(incomeCategories.map((c) => c.slug));

  const resolveExpSlug = (slug: string) => (expSlugs.has(slug) ? slug : defaultExpSlug);
  const resolveIncSlug = (slug: string) => (incSlugs.has(slug) ? slug : defaultIncSlug);

  const suggestedExpenseMappings: Record<string, string> = {};
  const suggestedIncomeMappings: Record<string, string> = {};

  const validRule = (r: PatternRule) => (r.pattern?.trim() ?? "") !== "";
  const expRules = rules.filter((r) => r.type === "expense" && validRule(r));
  const incRules = rules.filter((r) => r.type === "income" && validRule(r));

  for (let i = 0; i < expenseRows.length; i++) {
    const particulars = expenseRows[i].particulars ?? "";
    let matched = false;
    for (const rule of expRules) {
      if (matchesRule(particulars, rule)) {
        suggestedExpenseMappings[String(i)] = resolveExpSlug(rule.slug);
        matched = true;
        break;
      }
    }
    if (!matched) suggestedExpenseMappings[String(i)] = defaultExpSlug;
  }

  for (let i = 0; i < incomeRows.length; i++) {
    const particulars = incomeRows[i].particulars ?? "";
    let matched = false;
    for (const rule of incRules) {
      if (matchesRule(particulars, rule)) {
        suggestedIncomeMappings[String(i)] = resolveIncSlug(rule.slug);
        matched = true;
        break;
      }
    }
    if (!matched) suggestedIncomeMappings[String(i)] = defaultIncSlug;
  }

  return { suggestedExpenseMappings, suggestedIncomeMappings };
}

/**
 * Derive rowIndices for proposed new categories by matching pattern against rows.
 */
function deriveRowIndicesForProposed(
  proposed: Array<{ pattern: string; matchType: "prefix" | "substring"; type: "expense" | "income" }>,
  expenseRows: ParsedExpenseRow[],
  incomeRows: ParsedIncomeRow[]
): number[][] {
  return proposed.map((p) => {
    const rule: PatternRule = { ...p, slug: "" };
    const indices: number[] = [];
    if (p.type === "expense") {
      for (let i = 0; i < expenseRows.length; i++) {
        if (matchesRule(expenseRows[i].particulars ?? "", rule)) indices.push(i);
      }
    } else {
      for (let i = 0; i < incomeRows.length; i++) {
        if (matchesRule(incomeRows[i].particulars ?? "", rule)) indices.push(i);
      }
    }
    return indices;
  });
}

/**
 * Analyze parsed CSV rows and suggest category mappings using Gemini.
 * Single AI call with pattern-based rules; applies rules locally for 10K+ rows.
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
    const defaultExp = expenseCategories[0]?.slug ?? "miscellaneous";
    const defaultInc = incomeCategories[0]?.slug ?? "other";
    const expMap: Record<string, string> = {};
    const incMap: Record<string, string> = {};
    expenseRows.forEach((_, i) => { expMap[String(i)] = defaultExp; });
    incomeRows.forEach((_, i) => { incMap[String(i)] = defaultInc; });
    const { expMappings, incMappings } = preMappFromMajorHead(expenseRows, incomeRows, expenseCategories, incomeCategories);
    Object.assign(expMap, expMappings);
    Object.assign(incMap, incMappings);
    return {
      suggestedExpenseMappings: expMap,
      suggestedIncomeMappings: incMap,
      proposedNewCategories: [],
    };
  }

  const incCats = incomeCategories.length > 0 ? incomeCategories : [{ id: "", name: "Other", slug: "other" }];
  const defaultExpSlug = expenseCategories[0]?.slug ?? "miscellaneous";
  const defaultIncSlug = incCats[0]?.slug ?? "other";

  const { expense: expParticulars, income: incParticulars } = buildParticularsWithCounts(expenseRows, incomeRows);
  const majorHeadCounts = buildMajorHeadCounts(expenseRows, incomeRows);

  const expCatList = expenseCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");
  const incCatList = incCats.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");

  const hasMajorHeads = Object.keys(majorHeadCounts.expense).length > 0 || Object.keys(majorHeadCounts.income).length > 0;
  const majorHeadSection = hasMajorHeads ? `
MAJOR HEAD VALUES FROM CSV (these are category hints from the bank statement — use them to determine the correct category):
Expense Major Heads (majorHead -> rowCount):
${JSON.stringify(majorHeadCounts.expense, null, 2)}

Income Major Heads (majorHead -> rowCount):
${JSON.stringify(majorHeadCounts.income, null, 2)}

IMPORTANT: The Major Head column is a strong category signal. Match Major Head values to the closest available category slug. For example, "Faculty Payment" -> faculty_payments, "Rent Expenses" -> rent, "Electricity Charges" -> electricity_charges, "Revenue" -> fee or the default income category.
` : "";

  const prompt = `You are analyzing a bank statement CSV for expense and income import. Return PATTERN RULES to categorize rows, and PROPOSED NEW CATEGORIES when data doesn't fit existing ones.

AVAILABLE EXPENSE CATEGORIES (use slug): ${expCatList || "miscellaneous (slug: miscellaneous)"}
AVAILABLE INCOME CATEGORIES (use slug): ${incCatList}
${majorHeadSection}
EXPENSE PARTICULARS WITH ROW COUNTS (particular -> count):
${JSON.stringify(expParticulars, null, 2)}

INCOME PARTICULARS WITH ROW COUNTS (particular -> count):
${JSON.stringify(incParticulars, null, 2)}

TOTALS: ${expenseRows.length} expense rows, ${incomeRows.length} income rows.

RULES:
1. Return patternRules: array of { pattern, slug, type, matchType }. pattern is a string; matchType "prefix" means particulars starts with pattern (strip trailing *), "substring" means particulars includes pattern.
2. Order rules by specificity: more specific patterns first (e.g. "Salary- Jan" before "Salary").
3. Map common patterns: Salary-*, UPI/, NEFT, Rent, etc. to existing categories.
4. Use the Major Head values (if provided) as strong hints — they indicate the intended category for each row.
5. For proposedNewCategories: propose 0-5 new categories when a clear pattern (5+ rows) doesn't fit. Include pattern and matchType so we can derive rowIndices.
6. Example: many "Salary- Jan", "Salary- Feb" rows but no payroll category -> propose { name: "Payroll", slug: "payroll", type: "expense", pattern: "Salary-", matchType: "prefix", reason: "33 salary rows" }.

Return JSON with patternRules and proposedNewCategories.`;

  let patternRules: PatternRule[] = [];
  let proposedNewCategories: AnalyzeImportResult["proposedNewCategories"] = [];

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: PATTERN_RULES_RESPONSE_SCHEMA,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (text.trim()) {
      const parsed = parseGeminiJson<{ patternRules?: PatternRule[]; proposedNewCategories?: Array<{
        name: string; slug: string; reason: string; type: "expense" | "income"; pattern?: string; matchType?: "prefix" | "substring";
      }> }>(text);
      patternRules = Array.isArray(parsed.patternRules) ? parsed.patternRules : [];
      const rawProposed = Array.isArray(parsed.proposedNewCategories) ? parsed.proposedNewCategories : [];

      const withIndices = rawProposed.map((p) => ({
        name: p.name,
        slug: p.slug,
        reason: p.reason,
        type: p.type,
        pattern: (p.pattern ?? "").trim(),
        matchType: (p.matchType ?? "substring") as "prefix" | "substring",
      }));

      // Dedupe by slug (AI may return duplicates)
      const seenSlugs = new Set<string>();
      const deduped = withIndices.filter((p) => {
        if (seenSlugs.has(p.slug)) return false;
        seenSlugs.add(p.slug);
        return true;
      });

      const rowIndicesList = deriveRowIndicesForProposed(
        deduped.map(({ pattern, matchType, type }) => ({ pattern, matchType, type })),
        expenseRows,
        incomeRows
      );

      proposedNewCategories = deduped.map((p, i) => ({
        name: p.name,
        slug: p.slug,
        reason: p.reason,
        type: p.type,
        rowIndices: rowIndicesList[i] ?? [],
      }));
    }
  } catch (e) {
    console.error("Import analyze AI call failed", { err: e });
    const expMap: Record<string, string> = {};
    const incMap: Record<string, string> = {};
    expenseRows.forEach((_, i) => { expMap[String(i)] = defaultExpSlug; });
    incomeRows.forEach((_, i) => { incMap[String(i)] = defaultIncSlug; });
    const { expMappings, incMappings } = preMappFromMajorHead(expenseRows, incomeRows, expenseCategories, incCats);
    Object.assign(expMap, expMappings);
    Object.assign(incMap, incMappings);
    return {
      suggestedExpenseMappings: expMap,
      suggestedIncomeMappings: incMap,
      proposedNewCategories: [],
    };
  }

  let { suggestedExpenseMappings, suggestedIncomeMappings } = applyPatternRules(
    expenseRows,
    incomeRows,
    patternRules,
    expenseCategories,
    incCats,
    defaultExpSlug,
    defaultIncSlug
  );

  // Overlay proposed new category mappings so those rows show the proposed slug
  for (const p of proposedNewCategories) {
    for (const idx of p.rowIndices ?? []) {
      if (p.type === "expense") {
        suggestedExpenseMappings[String(idx)] = p.slug;
      } else {
        suggestedIncomeMappings[String(idx)] = p.slug;
      }
    }
  }

  // Overlay direct Major Head → category matches (highest priority)
  const { expMappings: majorHeadExpMap, incMappings: majorHeadIncMap } = preMappFromMajorHead(
    expenseRows, incomeRows, expenseCategories, incCats
  );
  for (const [idx, slug] of Object.entries(majorHeadExpMap)) {
    suggestedExpenseMappings[idx] = slug;
  }
  for (const [idx, slug] of Object.entries(majorHeadIncMap)) {
    suggestedIncomeMappings[idx] = slug;
  }

  return {
    suggestedExpenseMappings,
    suggestedIncomeMappings,
    proposedNewCategories,
  };
}
