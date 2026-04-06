/**
 * AI-powered analytics insights using Gemini.
 * Dashboard CFO insights use GEMINI_ANALYSIS_MODEL (default: gemini-3.1-pro-preview).
 * Predictions use the same analysis model when set, else GEMINI_MODEL.
 */

import { GoogleGenAI } from "@google/genai";
import type { CfoInsightPayload, CfoStructuredInsightResult } from "./cfo-insight-types.js";

export type AnalyticsSummary = {
  totalExpenses: number;
  totalIncome: number;
  netCashflow: number;
  expenseTrend: number;
  incomeTrend: number;
  prevTotalExpenses: number;
  prevTotalIncome: number;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  topCostCenters: Array<{ name: string; amount: number }>;
  startDate: string;
  endDate: string;
};

export type FinancialTxn = {
  date: string;
  amount: number;
  category?: string;
  costCenter?: string;
  description?: string;
};

export type GeminiPredictionInput = {
  horizonDays: number;
  startingBalance: number;
  expenseTransactions: FinancialTxn[];
  incomeTransactions: FinancialTxn[];
  contextSummary?: {
    monthlyExpenseTotals?: Array<{ month: string; amount: number }>;
    monthlyIncomeTotals?: Array<{ month: string; amount: number }>;
    topExpenseCategories?: Array<{ name: string; amount: number }>;
    topIncomeCategories?: Array<{ name: string; amount: number }>;
  };
};

export type GeminiPredictionResult = {
  expenseForecast: Array<{ date: string; amount: number }>;
  incomeForecast: Array<{ date: string; amount: number }>;
  cashflowForecast: Array<{ date: string; netPosition: number }>;
  cashRequiredNextWeek: number;
  cashRequiredHorizon: number;
  forecastRange: { min: number; max: number };
  confidence: "low" | "medium" | "high";
  driverFactors: string[];
  alerts: Array<{ type: string; message: string }>;
  model: string;
};

const PREDICTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    expenseForecast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          amount: { type: "number" },
        },
        required: ["date", "amount"],
      },
    },
    incomeForecast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          amount: { type: "number" },
        },
        required: ["date", "amount"],
      },
    },
    cashflowForecast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          netPosition: { type: "number" },
        },
        required: ["date", "netPosition"],
      },
    },
    cashRequiredNextWeek: { type: "number" },
    cashRequiredHorizon: { type: "number" },
    forecastRange: {
      type: "object",
      properties: {
        min: { type: "number" },
        max: { type: "number" },
      },
      required: ["min", "max"],
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    driverFactors: {
      type: "array",
      items: { type: "string" },
    },
    alerts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          message: { type: "string" },
        },
        required: ["type", "message"],
      },
    },
  },
  required: [
    "expenseForecast",
    "incomeForecast",
    "cashflowForecast",
    "cashRequiredNextWeek",
    "cashRequiredHorizon",
    "forecastRange",
    "confidence",
    "driverFactors",
    "alerts",
  ],
} as const;

const CFO_INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    narrative: {
      type: "string",
      description: "2-4 sentence executive summary; use ₹ (Indian) for amounts; cite only provided numbers.",
    },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      description: "3-6 bullet-style short facts (no invented figures).",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "0-4 risk or watch items grounded in the data.",
    },
    suggestedActions: {
      type: "array",
      items: { type: "string" },
      description: "0-4 practical next steps for finance (e.g. review vendor, speed approvals).",
    },
  },
  required: ["narrative", "keyPoints", "risks", "suggestedActions"],
} as const;

const MAX_PREDICTION_CONTEXT_CHARS = 200_000;

let ai: GoogleGenAI | null = null;

/** Model for FP&A / dashboard analysis (insights, predictions). WhatsApp worker uses GEMINI_MODEL separately. */
export function getGeminiAnalysisModel(): string {
  return process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.1-pro-preview";
}

function getGemini(): GoogleGenAI | null {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Legacy: thin narrative from summary only. Prefer `generateCfoStructuredInsights(payload)` with full payload.
 */
export async function generateAnalyticsInsights(summary: AnalyticsSummary): Promise<string | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const prompt = `You are a finance analyst. Summarize these analytics in 2-3 concise sentences for a dashboard. Focus on key trends and notable insights. Use Indian Rupee (₹) format. Be specific with numbers.

Period: ${summary.startDate} to ${summary.endDate}

Current period:
- Total expenses: ₹${summary.totalExpenses.toLocaleString("en-IN")}
- Total income: ₹${summary.totalIncome.toLocaleString("en-IN")}
- Net cashflow: ₹${summary.netCashflow.toLocaleString("en-IN")} (${summary.netCashflow >= 0 ? "surplus" : "deficit"})

vs previous period:
- Expense trend: ${summary.expenseTrend >= 0 ? "+" : ""}${summary.expenseTrend.toFixed(1)}%
- Income trend: ${summary.incomeTrend >= 0 ? "+" : ""}${summary.incomeTrend.toFixed(1)}%

Top expense categories: ${summary.topExpenseCategories.map((c) => `${c.name} (₹${c.amount.toLocaleString("en-IN")})`).join(", ") || "None"}
Top cost centers: ${summary.topCostCenters.map((c) => `${c.name} (₹${c.amount.toLocaleString("en-IN")})`).join(", ") || "None"}

Write 2-3 sentences. No bullet points. Plain prose.`;

  try {
    const response = await gemini.models.generateContent({
      model: getGeminiAnalysisModel(),
      contents: prompt,
    });
    const text = (response as { text?: string }).text ?? "";
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * CFO-style structured insights from deterministic payload (analytics + optional MIS slice).
 * Numbers must match the JSON; do not invent totals.
 */
export async function generateCfoStructuredInsights(payload: CfoInsightPayload): Promise<CfoStructuredInsightResult | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const model = getGeminiAnalysisModel();
  const json = JSON.stringify(payload);
  if (json.length > MAX_PREDICTION_CONTEXT_CHARS) {
    return null;
  }

  const prompt = `You are a senior CFO / FP&A advisor for an Indian organization. Interpret ONLY the financial facts in the JSON below.

Rules:
- Use Indian Rupee (₹) formatting in prose; numbers must match the JSON.
- Do not invent vendors, amounts, or dates not present.
- MIS block (if present) is management-reporting view aligned with FinJoe MIS (P&L / cashflow).
- Highlight concentration (HHI, top-3 shares), approval aging, and MIS EBITDA / revenue if relevant.
- Keep narrative concise; keyPoints are short (one line each).

FINANCIAL_FACTS_JSON:
${json}`;

  try {
    const response = await gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CFO_INSIGHT_RESPONSE_SCHEMA as any,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as Omit<CfoStructuredInsightResult, "model">;
    return {
      narrative: String(parsed.narrative ?? "").trim(),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((x) => String(x)) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map((x) => String(x)) : [],
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.map((x) => String(x)) : [],
      model,
    };
  } catch {
    return null;
  }
}

export async function generateGeminiPredictions(input: GeminiPredictionInput): Promise<GeminiPredictionResult | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const horizonDays = Math.min(90, Math.max(1, Math.round(input.horizonDays || 30)));
  const today = new Date().toISOString().slice(0, 10);
  const model = process.env.GEMINI_ANALYSIS_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

  const expenseTransactions = input.expenseTransactions.slice(-240);
  const incomeTransactions = input.incomeTransactions.slice(-240);
  const contextSummary = input.contextSummary ?? {};
  const payloadForModel = {
    expenseTransactions,
    incomeTransactions,
    contextSummary,
  };
  const payloadJson = JSON.stringify(payloadForModel);
  if (payloadJson.length > MAX_PREDICTION_CONTEXT_CHARS) {
    return null;
  }

  const prompt = `You are a senior FP&A analyst. Generate financial predictions from expense/income transactions.

Today's date: ${today}
Horizon days: ${horizonDays}
Starting net position: 0 (forecast is relative — shows cumulative income minus expenses from today)

Rules:
- Build a day-level forecast for exactly ${horizonDays} days from today.
- expenseForecast and incomeForecast must each have ${horizonDays} rows.
- cashflowForecast must have ${horizonDays} rows and be cumulative net (income minus expenses), starting from 0.
- cashRequiredNextWeek = projected shortfall (how far cumulative net goes below 0) in next 7 days (>= 0, 0 if no shortfall).
- cashRequiredHorizon = projected shortfall (how far cumulative net goes below 0) over next ${horizonDays} days (>= 0, 0 if no shortfall).
- forecastRange min/max should represent plausible lower/upper cumulative net position over the horizon.
- confidence must be one of: low, medium, high.
- driverFactors: 3-6 short strings with key drivers.
- alerts: include meaningful alerts only.
- Use transaction evidence; do not invent external data.
- Return strict JSON only.

BOUNDED_FINANCIAL_CONTEXT_JSON:
${payloadJson}`;

  try {
    const response = await gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: PREDICTION_RESPONSE_SCHEMA as any,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as Omit<GeminiPredictionResult, "model">;
    return {
      ...parsed,
      model,
    };
  } catch {
    return null;
  }
}
