/**
 * AI-powered analytics insights using Gemini.
 * Generates a 2-3 sentence narrative explaining trends from analytics data.
 */

import { GoogleGenAI } from "@google/genai";

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
 * Generate a 2-3 sentence AI narrative explaining the analytics trends.
 * Returns null if GEMINI_API_KEY is not set or the API fails.
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
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents: prompt,
    });
    const text = (response as { text?: string }).text ?? "";
    return text.trim() || null;
  } catch {
    return null;
  }
}
