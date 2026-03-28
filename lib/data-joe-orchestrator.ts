/**
 * dataJoe — universal financial document analysis (PDF, XLSX, XML, non–bank-statement CSV).
 */

import Papa from "papaparse";
import { PDFDocument, type LoadOptions } from "pdf-lib";
import { decryptPDF } from "@pdfsmaller/pdf-decrypt";
import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import type { ParsedExpenseRow, ParsedIncomeRow } from "./bank-statement-parser.js";
import type { BankStatementAnalyzeResponse } from "./bank-import-analyze.js";
import { runBankStatementImportAnalyze } from "./bank-import-analyze.js";
import type { CategoryInfo, PatternRule } from "./import-analyzer.js";
import {
  applyPatternRules,
  deriveRowIndicesForProposed,
  preMappFromMajorHead,
} from "./import-analyzer.js";
import { db as drizzleDb } from "../server/db.js";

let genai: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI | null {
  if (!genai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    genai = new GoogleGenAI({ apiKey });
  }
  return genai;
}

function parseGeminiJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const repaired = jsonrepair(text);
    return JSON.parse(repaired) as T;
  }
}

/** Heuristic: CSV looks like a bank statement with withdrawals/deposits columns. */
export function looksLikeBankStatementCsv(buffer: Buffer): boolean {
  const text = buffer.toString("utf-8").slice(0, 120000);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, preview: 3 });
  const fields = (parsed.meta.fields ?? []).map((f: string) => f.toLowerCase().replace(/\s+/g, " ").trim());
  const joined = fields.join("|");
  const hasWithdrawalCol =
    fields.some((f) => f.includes("withdrawal") || f === "debit" || (f.includes("debit") && !f.includes("credit"))) ||
    /\bwithdrawal/.test(joined);
  const hasDepositCol =
    fields.some((f) => f.includes("deposit") || f === "credit" || (f.includes("credit") && !f.includes("debit"))) ||
    /\bdeposit/.test(joined);
  const hasParticularsCol = fields.some((f) => f.includes("particular") || f.includes("description") || f.includes("narration"));
  const hasAmount = fields.some((f) => f === "amount" || f.endsWith("amount"));
  const hasType = fields.some((f) => f.includes("type") || f.includes("cr/dr") || f.includes("dr/cr"));
  return (
    (hasWithdrawalCol && hasDepositCol) ||
    (hasWithdrawalCol && hasParticularsCol) ||
    (hasDepositCol && hasParticularsCol) ||
    (hasAmount && hasParticularsCol && hasType)
  );
}

function normalizeDate(s: string | undefined): string | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ddmm = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export type UniversalAnalyzeResult =
  | { mode: "legacy_bank_csv"; result: BankStatementAnalyzeResponse }
  | { mode: "universal"; needsPassword: true }
  | {
      mode: "universal";
      needsPassword?: false;
      documentType: string;
      destination: "bank_transactions" | "expenses" | "income_records" | "mixed";
      summary: string;
      expenseRows: ParsedExpenseRow[];
      incomeRows: ParsedIncomeRow[];
      suggestedExpenseMappings: Record<string, string>;
      suggestedIncomeMappings: Record<string, string>;
      proposedNewCategories: Array<{
        name: string;
        slug: string;
        reason: string;
        type: "expense" | "income";
        rowIndices?: number[];
      }>;
      skippedZero?: number;
    }
  | { mode: "error"; error: string };

const DATAJOE_SCHEMA = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      enum: ["bank_statement", "expense_ledger", "income_ledger", "general_ledger", "tally_vouchers", "unknown"],
    },
    destination: {
      type: "string",
      enum: ["bank_transactions", "expenses", "income_records", "mixed"],
    },
    summary: { type: "string" },
    patternRules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          slug: { type: "string" },
          type: { type: "string", enum: ["expense", "income"] },
          matchType: { type: "string", enum: ["prefix", "substring"] },
        },
        required: ["pattern", "slug", "type", "matchType"],
      },
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
          pattern: { type: "string" },
          matchType: { type: "string", enum: ["prefix", "substring"] },
        },
        required: ["name", "slug", "reason", "type", "pattern", "matchType"],
      },
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          particulars: { type: "string" },
          amount: { type: "number" },
          type: { type: "string", enum: ["debit", "credit"] },
          branch: { type: "string" },
          voucherNumber: { type: "string" },
          vendorName: { type: "string" },
          categoryHint: { type: "string" },
        },
        required: ["particulars", "amount", "type"],
      },
    },
  },
  required: ["documentType", "destination", "summary", "rows", "patternRules", "proposedNewCategories"],
} as const;

async function xlsxFirstSheetToText(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return "";
  const sheet = wb.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  return csv.slice(0, 400_000);
}

export async function tryPreparePdfBuffer(buffer: Buffer, password?: string): Promise<{ ok: Buffer; needsPassword?: boolean }> {
  try {
    await PDFDocument.load(buffer, { ignoreEncryption: false });
    return { ok: buffer };
  } catch {
    if (!password) return { ok: buffer, needsPassword: true };
    try {
      const decryptedBytes = await decryptPDF(buffer, password);
      // Verify we can load the decrypted bytes without error
      await PDFDocument.load(decryptedBytes, { ignoreEncryption: false });
      return { ok: Buffer.from(decryptedBytes) };
    } catch {
      return { ok: buffer, needsPassword: true };
    }
  }
}

export async function analyzeDataJoeDocument(
  db: typeof drizzleDb,
  tid: string,
  buffer: Buffer,
  filename: string,
  password: string | undefined,
  expCats: CategoryInfo[],
  incCats: CategoryInfo[]
): Promise<UniversalAnalyzeResult> {
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith(".csv");
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const isXml = lower.endsWith(".xml");
  const isPdf = lower.endsWith(".pdf");

  if (isCsv && looksLikeBankStatementCsv(buffer)) {
    const result = await runBankStatementImportAnalyze(db, tid, buffer);
    return { mode: "legacy_bank_csv", result };
  }

  if (isPdf) {
    const prep = await tryPreparePdfBuffer(buffer, password);
    if (prep.needsPassword && !password) {
      return { mode: "universal", needsPassword: true };
    }
    return runUniversalGemini(prep.ok, filename, "application/pdf", expCats, incCats, true);
  }

  let textBody = "";
  if (isXlsx) {
    textBody = await xlsxFirstSheetToText(buffer);
  } else if (isCsv || isXml) {
    textBody = buffer.toString("utf-8").slice(0, 400_000);
  } else {
    textBody = buffer.toString("utf-8").slice(0, 400_000);
  }

  if (!textBody.trim()) {
    return { mode: "error", error: "Could not read any text from this file." };
  }

  return runUniversalGemini(Buffer.from(textBody, "utf-8"), filename, "text/plain", expCats, incCats, false);
}

async function runUniversalGemini(
  buffer: Buffer,
  filename: string,
  mime: "application/pdf" | "text/plain",
  expenseCategories: CategoryInfo[],
  incomeCategories: CategoryInfo[],
  isPdf: boolean
): Promise<UniversalAnalyzeResult> {
  const gemini = getGemini();
  const incCats = incomeCategories.length > 0 ? incomeCategories : [{ id: "", name: "Other", slug: "other" }];
  const defaultExpSlug = expenseCategories[0]?.slug ?? "miscellaneous";
  const defaultIncSlug = incCats[0]?.slug ?? "other";

  const expCatList = expenseCategories.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");
  const incCatList = incCats.map((c) => `${c.name} (slug: ${c.slug})`).join(", ");

  const prompt = `You are dataJoe, a financial data extractor. Parse the attached document and return ALL monetary transaction rows.

AVAILABLE EXPENSE CATEGORY SLUGS: ${expCatList || "miscellaneous"}
AVAILABLE INCOME CATEGORY SLUGS: ${incCatList}

Rules:
1. For each row: debit = money out (expense/bank withdrawal), credit = money in (income/bank deposit).
2. Amounts are in Indian Rupees as plain numbers (no paise).
3. Dates: prefer YYYY-MM-DD when possible.
4. destination: "mixed" if both debits and credits exist; "bank_transactions" if this is only a raw bank statement with no ledger classification; "expenses" or "income_records" if clearly one-sided ledger.
5. patternRules: like import mapping — prefix/substring rules from particulars to category slug (expense vs income).
6. proposedNewCategories: only when a clear repeated pattern does not fit existing slugs.

File name: ${filename}`;

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  try {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];
    if (isPdf && mime === "application/pdf") {
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
        },
      });
    } else {
      parts.push({ text: `\n--- DOCUMENT TEXT ---\n${buffer.toString("utf-8").slice(0, 350_000)}` });
    }

    if (!gemini) {
      return { mode: "error", error: "GEMINI_API_KEY is not configured." };
    }

    const response = await gemini.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: DATAJOE_SCHEMA as unknown as Record<string, unknown>,
        httpOptions: { timeout: 120_000 },
      },
    });

    const text = (response as { text?: string }).text ?? "";
    if (!text.trim()) {
      return { mode: "error", error: "Empty response from AI model." };
    }

    const parsed = parseGeminiJson<{
      documentType: string;
      destination: "bank_transactions" | "expenses" | "income_records" | "mixed";
      summary: string;
      patternRules: PatternRule[];
      proposedNewCategories: Array<{
        name: string;
        slug: string;
        reason: string;
        type: "expense" | "income";
        pattern: string;
        matchType: "prefix" | "substring";
      }>;
      rows: Array<{
        date?: string;
        particulars: string;
        amount: number;
        type: "debit" | "credit";
        branch?: string;
        voucherNumber?: string;
        vendorName?: string;
        categoryHint?: string;
      }>;
    }>(text);

    const expenseRows: ParsedExpenseRow[] = [];
    const incomeRows: ParsedIncomeRow[] = [];
    let skippedZero = 0;

    for (const r of parsed.rows ?? []) {
      const amt = Math.round(Math.abs(Number(r.amount) || 0));
      if (amt <= 0) {
        skippedZero++;
        continue;
      }
      const date = normalizeDate(r.date);
      const majorHead = r.categoryHint?.trim();
      if (r.type === "debit") {
        expenseRows.push({
          date,
          dateRaw: date ? undefined : r.date,
          particulars: r.particulars || "—",
          amount: amt,
          categoryMatch: defaultExpSlug,
          majorHead: majorHead || undefined,
          branch: r.branch?.trim() || undefined,
        });
      } else {
        incomeRows.push({
          date,
          dateRaw: date ? undefined : r.date,
          particulars: r.particulars || "—",
          amount: amt,
          categoryMatch: defaultIncSlug,
          majorHead: majorHead || undefined,
          branch: r.branch?.trim() || undefined,
        });
      }
    }

    const rules = Array.isArray(parsed.patternRules) ? parsed.patternRules : [];
    let { suggestedExpenseMappings, suggestedIncomeMappings } = applyPatternRules(
      expenseRows,
      incomeRows,
      rules,
      expenseCategories,
      incCats,
      defaultExpSlug,
      defaultIncSlug
    );

    const rawProposed = Array.isArray(parsed.proposedNewCategories) ? parsed.proposedNewCategories : [];
    const deduped = rawProposed.filter((p, i, a) => a.findIndex((x) => x.slug === p.slug) === i);
    const rowIndicesList = deriveRowIndicesForProposed(
      deduped.map(({ pattern, matchType, type }) => ({ pattern, matchType, type })),
      expenseRows,
      incomeRows
    );
    const proposedNewCategories = deduped.map((p, i) => ({
      name: p.name,
      slug: p.slug,
      reason: p.reason,
      type: p.type,
      rowIndices: rowIndicesList[i] ?? [],
    }));

    for (const p of proposedNewCategories) {
      for (const idx of p.rowIndices ?? []) {
        if (p.type === "expense") suggestedExpenseMappings[String(idx)] = p.slug;
        else suggestedIncomeMappings[String(idx)] = p.slug;
      }
    }

    const { expMappings: majorHeadExpMap, incMappings: majorHeadIncMap } = preMappFromMajorHead(
      expenseRows,
      incomeRows,
      expenseCategories,
      incCats
    );
    for (const [idx, slug] of Object.entries(majorHeadExpMap)) {
      suggestedExpenseMappings[idx] = slug;
    }
    for (const [idx, slug] of Object.entries(majorHeadIncMap)) {
      suggestedIncomeMappings[idx] = slug;
    }

    const dest = parsed.destination ?? "mixed";
    if (dest === "bank_transactions") {
      for (let i = 0; i < expenseRows.length; i++) suggestedExpenseMappings[String(i)] = suggestedExpenseMappings[String(i)] ?? defaultExpSlug;
      for (let i = 0; i < incomeRows.length; i++) suggestedIncomeMappings[String(i)] = suggestedIncomeMappings[String(i)] ?? defaultIncSlug;
    }

    return {
      mode: "universal",
      documentType: parsed.documentType ?? "unknown",
      destination: dest,
      summary: parsed.summary ?? "",
      expenseRows,
      incomeRows,
      suggestedExpenseMappings,
      suggestedIncomeMappings,
      proposedNewCategories,
      skippedZero,
    };
  } catch (e) {
    return { mode: "error", error: String(e) };
  }
}
