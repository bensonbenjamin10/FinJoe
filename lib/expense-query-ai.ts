/**
 * AI-assisted natural language expense query.
 * Converts free-form questions like "What did we spend on stationery last year?"
 * into structured search parameters for list_expenses/search_expenses.
 * Supports Indian date formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 */

import { GoogleGenAI } from "@google/genai";

/** Parse various date formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) to YYYY-MM-DD. Returns null if invalid. */
export function parseDateToISO(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  // YYYY-MM-DD (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10));
    if (!isNaN(date.getTime()) && date.getFullYear() === parseInt(y!, 10) && date.getMonth() === parseInt(m!, 10) - 1) {
      return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY (Indian format)
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10));
    if (!isNaN(date.getTime()) && date.getDate() === parseInt(d!, 10) && date.getMonth() === parseInt(m!, 10) - 1) {
      return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    }
  }
  return null;
}

export type ParsedExpenseQuery = {
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  campusId?: string | null;
  categoryHint?: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    searchQuery: { type: "string", description: "Keywords to search in vendor, description, particulars" },
    startDate: { type: "string", description: "YYYY-MM-DD" },
    endDate: { type: "string", description: "YYYY-MM-DD" },
    campusId: { type: "string", description: "Cost center ID or null for all" },
    categoryHint: { type: "string", description: "Expense category hint for filtering" },
  },
  required: [],
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
 * Parse a natural language expense question into structured search params.
 * Returns null if GEMINI_API_KEY is not set or parsing fails.
 */
export async function parseExpenseQuery(
  question: string,
  availableCostCenters: Array<{ id: string; name: string }>,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<ParsedExpenseQuery | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const campusList = availableCostCenters.map((c) => `${c.name} (id: ${c.id})`).join(", ");

  const prompt = `Convert this expense question into search parameters.

Today's date is ${today} (YYYY-MM-DD). Use this for all relative date calculations.

User question: "${question}"

Available cost centers: ${campusList || "None"}

Rules:
- "last year" = startDate: (today - 1 year), endDate: today
- "last month" = startDate: (today - 1 month), endDate: today
- "this month" = startDate: first of month, endDate: today
- "stationery", "travel", "petrol" etc. → searchQuery with those keywords
- "across all campuses" or "all" → campusId: null
- Specific campus name → campusId: that campus's id
- Extract category hints (travel, office supplies, etc.) into categoryHint

Return JSON with searchQuery, startDate, endDate, campusId, categoryHint. Output dates as YYYY-MM-DD. Users may say dates in Indian format (DD/MM/YYYY or DD-MM-YYYY)—convert to YYYY-MM-DD. Omit fields if not determinable.`;

  try {
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA as any,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return null;

    const parsed = JSON.parse(text) as ParsedExpenseQuery;
    // Sanitize dates: accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. Reject malformed (e.g. entire object as startDate).
    const normStart = parsed.startDate ? parseDateToISO(parsed.startDate) : undefined;
    const normEnd = parsed.endDate ? parseDateToISO(parsed.endDate) : undefined;
    parsed.startDate = normStart ?? undefined;
    parsed.endDate = normEnd ?? undefined;
    return parsed;
  } catch {
    return null;
  }
}
