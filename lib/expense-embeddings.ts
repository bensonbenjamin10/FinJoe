/**
 * Expense embeddings for RAG / semantic search.
 * Uses Gemini embedding API to create vector representations of expense text.
 */

import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

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
 * Build searchable text from expense fields for embedding.
 */
export function buildExpenseSearchText(params: {
  vendorName?: string | null;
  description?: string | null;
  particulars?: string | null;
  categoryName?: string | null;
  amount?: number;
  invoiceNumber?: string | null;
  baseAmount?: number | null;
  taxAmount?: number | null;
  taxRate?: number | null;
}): string {
  const parts: string[] = [];
  if (params.vendorName) parts.push(`Vendor: ${params.vendorName}`);
  if (params.description) parts.push(`Description: ${params.description}`);
  if (params.particulars) parts.push(`Particulars: ${params.particulars}`);
  if (params.categoryName) parts.push(`Category: ${params.categoryName}`);
  if (params.amount != null) parts.push(`Amount: Rs ${params.amount}`);
  if (params.invoiceNumber) parts.push(`Invoice: ${params.invoiceNumber}`);
  if (params.baseAmount != null) parts.push(`Taxable: Rs ${params.baseAmount}`);
  if (params.taxAmount != null) parts.push(`Tax: Rs ${params.taxAmount}`);
  if (params.taxRate != null) parts.push(`GST rate: ${params.taxRate}%`);
  return parts.join(". ") || "Expense record";
}

/**
 * Embed expense text into a 768-dim vector.
 * Returns null if GEMINI_API_KEY is not set or embedding fails.
 */
export async function embedExpenseText(params: {
  vendorName?: string | null;
  description?: string | null;
  particulars?: string | null;
  categoryName?: string | null;
  amount?: number;
  invoiceNumber?: string | null;
  baseAmount?: number | null;
  taxAmount?: number | null;
  taxRate?: number | null;
}): Promise<number[] | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const text = buildExpenseSearchText(params);
  if (!text.trim()) return null;

  try {
    const response = await gemini.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });

    const embedding = response.embeddings?.[0]?.values;
    if (!embedding || !Array.isArray(embedding)) return null;
    return embedding as number[];
  } catch (err) {
    console.error("[expense-embeddings] embedExpenseText failed", err);
    return null;
  }
}

/**
 * Embed a user query for semantic search.
 * Returns null if GEMINI_API_KEY is not set or embedding fails.
 */
export async function embedQuery(question: string): Promise<number[] | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const text = question.trim();
  if (!text) return null;

  try {
    const response = await gemini.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_QUERY",
      },
    });

    const embedding = response.embeddings?.[0]?.values;
    if (!embedding || !Array.isArray(embedding)) return null;
    return embedding as number[];
  } catch (err) {
    console.error("[expense-embeddings] embedQuery failed", err);
    return null;
  }
}
