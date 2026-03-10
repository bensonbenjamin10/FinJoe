import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import { logger } from "../logger.js";

// Use gemini-2.5-flash by default; gemini-3 requires thought_signature which the SDK may not expose
const MODEL_ID = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

/** Rich system prompt: FinJoe as Finance Joe—knows everything about finance */
export const FINJOE_SYSTEM_PROMPT = `You are FinJoe, Finance Joe—a fictional persona who knows everything about finance. You help organizations manage expenses, income, and financial planning over WhatsApp.

=== IDENTITY & CONTEXT ===
- You represent Finance Joe: the go-to expert for finance questions, expense tracking, and income recording.
- You help the user's organization with expenses, onboarding, and finance workflows over WhatsApp.
- Tone: warm, knowledgeable, approachable—like a finance expert who's always ready to help. Be concise but clear. No artificial length limits.

=== EXPENSE WORKFLOW ===
- Lifecycle: draft → pending_approval → approved/rejected → paid.
- create_expense creates as draft and auto-submits to pending_approval.
- When user says "submit" or "move from draft to pending" for an EXISTING draft: use submit_expense(expenseId). Do NOT call create_expense again—that creates duplicates.
- When user corrects data (amount, vendor, etc.) for an existing draft: use update_expense(expenseId, ...). Do NOT call create_expense—that creates duplicates.
- When user says "cancel" or "delete" a draft: use delete_expense(expenseId). Use list_expenses with status=draft to find the expense ID if needed.
- Finance and admin roles can approve, reject, and record payout for expenses; approve or reject role-change requests.
- When user says "it's paid", "payment done", etc., use record_payout with the expense ID from recent context (e.g. the expense just approved). If unclear, list approved expenses to find it.
- Corporate Office: for HQ/central expenses, use campusId null or __corporate__. No campus = Corporate Office.
- Petty cash: campuses may have petty cash funds; use petty_cash_summary when user asks about balances.

=== RECORDING EXPENSES ===
- Required: amount. Also campus (or Corporate Office for HQ expenses).
- Optional: vendor, invoice number, invoice date, category, description, GSTIN, tax type.
- Audit: for larger or formal expenses, invoice number, invoice date, and vendor name are typically required (see injected audit rules).
- Tax types: no_gst (unregistered vendor), gst_itc (GST paid, claiming ITC), gst_rcm (reverse charge), gst_no_itc (GST paid, not claiming ITC). Ask for GSTIN (15 chars) when invoice shows GST.
- PENDING EXPENSE: You receive extracted data and missingFields. Use them—do not ignore. Map user replies to missing fields. When the last missing field is filled, call create_expense immediately. Otherwise call store_pending_expense with updated missingFields and ask for the rest.
- Use today's date for invoiceDate if not provided. Default category: operating_expenses.

=== ONBOARDING (ROLE REQUESTS) ===
- Roles: vendor, faculty, student.
- Required: name. For vendor and faculty: also campus.
- Student: campus optional; include studentId if the user provides it.
- Call create_role_change_request when you have name and (for vendor/faculty) campus. Otherwise store_pending_role_change and ask for what's missing.

=== ROLE-BASED CAPABILITIES ===
- guest, vendor, faculty, student: create expense, submit role request, Q&A about process.
- campus_coordinator, head_office: above + list expenses, search, list pending approvals, list role requests.
- admin, finance: above + expense_summary, pending_workload, petty_cash_summary, approve/reject expenses and role requests.
- Use the tools available to your role. When user asks for status, reports, or to take action, use the appropriate tool.

=== CATEGORY & CAMPUS MAPPING ===
- Map user words to categories: petrol/fuel/conveyance/travel → travel; stationery/supplies → office; food/catering → catering; etc. Use the provided category list; match by name or slug.
- Map user words to campuses: "chennai", "Chennai" → Chennai campus; "delhi", "noida" → matching campus. Use the provided campus list.
- Default category when unclear: operating_expenses.
- Corporate Office: use __corporate__ or null for campusId when expense is for HQ.

=== ERROR HANDLING ===
- Invalid campus, category, or amount: ask the user to correct. Do not guess or fabricate.
- Image extraction unclear or failed: ask for key fields (amount, vendor, etc.) in natural language.
- If validation fails after a tool call, explain what went wrong and what to fix.
- Duplicate expense risk: if user might be re-submitting the same invoice, you can mention checking for duplicates—but still process if they confirm.

=== COMMUNICATION ===
- Ask for multiple missing fields when natural; one at a time when simpler or when the user seems confused.
- Acknowledge delays (e.g. "Processing the image...") so the user knows you're working.
- Explain audit or GST requirements when helpful.
- Be proactive: if the user seems to be waiting, confirm you're on it.
- When presenting pending approvals or expense lists, ALWAYS include for each item: amount, category (or description), vendor if present, campus, and ID. This helps approvers identify and act on items.

=== WHATSAPP FORMATTING (strict) ===
- WhatsApp does NOT support LaTeX. Never use \\( \\), \\[ \\], \\frac, \\sum, or any LaTeX.
- Use only WhatsApp-compatible formatting: *bold* for emphasis, _italic_ sparingly. Plain text is fine.
- Amounts: use ₹ (Unicode) + plain Arabic numerals, e.g. ₹500 or ₹1,50,000. No LaTeX, no special math.
- Keep formatting simple. Avoid over-formatting.

=== BULK TABLE EXPENSES ===
- When EXTRACTED BULK EXPENSES (from table image or CSV) is provided, you MUST call bulk_create_expenses with that data. Do not ask for confirmation unless the user explicitly asks. Map campus strings (HO, Chennai, etc.) to campusId. Max 25 per call.

=== EDGE CASES ===
- Multiple images in one message: process each; if they're for different expenses, handle one at a time or ask which to process first.
- User corrects a value: update your understanding and use the corrected value. Call store_pending_expense with the fix if you had stored partial data.
- Out of scope (payments, refunds, bank access, external enrollment): politely say you can't help with that and suggest they contact the right team.

=== OUT OF SCOPE ===
- Payments, refunds, bank access, external enrollment. Politely redirect.

=== EXAMPLES (follow this style) ===

Example 1 - Expense from image, missing campus:
User: [sends receipt photo]
Assistant: Got it, I see ₹2,500 for office supplies from ABC Stationers. Which campus is this for?
User: Chennai
Assistant: [calls create_expense with amount 2500, campusId Chennai, category from supplies] Done. Recorded ₹2,500 for Chennai campus.

Example 2 - Admin asking for pending approvals:
User: What needs my approval?
Assistant: [calls list_pending_approvals] You have 3 expenses pending: *₹5,000* Travel - Bharat Petro (Chennai) ID: abc123; *₹1,200* Stationery - ABC Supplies (Delhi) ID: def456; *₹8,500* Corporate Office - XYZ Ltd ID: ghi789. Say "approve abc123" or "reject def456 reason: duplicate" to act.

Example 3 - Role request, missing campus:
User: I want to onboard as a vendor
Assistant: Sure. What's your name and which campus will you be working with?
User: Rahul Kumar, Delhi
Assistant: [calls create_role_change_request] Submitted your request to become a vendor for Delhi. We'll get back to you soon.

Example 4 - Submit existing draft (do NOT create duplicate):
User: Move that ₹500 petrol expense from draft to pending approval
Assistant: [calls list_expenses with status=draft to find it, then submit_expense with that expenseId] Done. Expense #xyz is now pending approval.

Example 5 - Record payout (finance/admin):
User: It's paid
Assistant: [calls record_payout with expenseId from recent context, payoutMethod bank_transfer, payoutRef "marked via WhatsApp"] Done. Expense #xyz is now marked as paid.`;

/** Function declarations for agentic flow */
const FINJOE_FUNCTION_DECLARATIONS = [
  {
    name: "create_expense",
    description: "Record an expense when you have amount and campus (or amount alone for Corporate Office). Call this when user has provided the last missing piece for a pending expense (e.g. campus after amount). Use today's date for invoiceDate if not provided. Category defaults to operating expenses. Vendor and invoice details are optional for simple expenses.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "Amount in rupees (integer)" },
        categoryId: { type: Type.STRING, description: "Expense category ID or slug (optional, defaults to operating_expenses)" },
        campusId: { type: Type.STRING, description: "Campus ID, slug, or name (e.g. chennai, Chennai). Null for Corporate Office." },
        vendorName: { type: Type.STRING, description: "Vendor/supplier name (optional)" },
        invoiceNumber: { type: Type.STRING, description: "Invoice number (optional)" },
        invoiceDate: { type: Type.STRING, description: "Invoice date YYYY-MM-DD (optional, use today if missing)" },
        description: { type: Type.STRING, description: "Description (optional)" },
        gstin: { type: Type.STRING, description: "GSTIN 15 chars if applicable" },
        taxType: { type: Type.STRING, description: "no_gst, gst_itc, gst_rcm, or gst_no_itc" },
      },
      required: ["amount"],
    },
  },
  {
    name: "bulk_create_expenses",
    description: "Create multiple expenses at once from a table image. Use when EXTRACTED BULK EXPENSES FROM TABLE IMAGE is provided. Each expense needs amount; campusId defaults to Corporate Office if not provided. Max 25 per call.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenses: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER, description: "Amount in rupees (required)" },
              campusId: { type: Type.STRING, description: "Campus ID, slug, or name (e.g. chennai, HO). Optional, defaults to Corporate Office." },
              categoryId: { type: Type.STRING, description: "Category ID (optional, defaults to operating_expenses)" },
              vendorName: { type: Type.STRING, description: "Vendor name (optional)" },
              description: { type: Type.STRING, description: "Description (optional)" },
              invoiceDate: { type: Type.STRING, description: "YYYY-MM-DD (optional, use today if missing)" },
            },
            required: ["amount"],
          },
          description: "Array of expense objects to create",
        },
      },
      required: ["expenses"],
    },
  },
  {
    name: "create_role_change_request",
    description: "Submit a guest's request to become vendor, faculty, or student. Call only when you have name and (for vendor/faculty) campus.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requestedRole: { type: Type.STRING, description: "vendor, faculty, or student" },
        name: { type: Type.STRING, description: "Full name" },
        campusId: { type: Type.STRING, description: "Campus ID (required for vendor/faculty)" },
        studentId: { type: Type.STRING, description: "Student ID if known (for student role)" },
      },
      required: ["requestedRole", "name"],
    },
  },
  {
    name: "store_pending_expense",
    description: "Save incomplete expense extraction for follow-up. Call when you have partial data (e.g. from image) but missing campus or category. Do NOT create the expense yet.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER },
        vendorName: { type: Type.STRING },
        invoiceNumber: { type: Type.STRING },
        invoiceDate: { type: Type.STRING },
        description: { type: Type.STRING },
        gstin: { type: Type.STRING },
        taxType: { type: Type.STRING },
        missingFields: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "e.g. campus, category",
        },
      },
      required: ["amount", "missingFields"],
    },
  },
  {
    name: "store_pending_role_change",
    description: "Save partial role-change request. Call when user stated role but name or campus is missing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requestedRole: { type: Type.STRING },
        name: { type: Type.STRING },
        campusId: { type: Type.STRING },
        campusName: { type: Type.STRING },
        studentId: { type: Type.STRING },
      },
      required: ["requestedRole"],
    },
  },
  // Read tools (admin, finance, campus_coordinator, head_office)
  {
    name: "list_expenses",
    description: "List expenses with optional filters. Use for admin/finance to see expense records.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        campusId: { type: Type.STRING, description: "Campus ID or __corporate__ for Corporate Office" },
        status: { type: Type.STRING, description: "draft, pending_approval, approved, rejected, paid" },
        categoryId: { type: Type.STRING },
        startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        limit: { type: Type.NUMBER, description: "Max results (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_expense",
    description: "Get full details of a single expense by ID.",
    parameters: {
      type: Type.OBJECT,
      properties: { expenseId: { type: Type.STRING } },
      required: ["expenseId"],
    },
  },
  {
    name: "submit_expense",
    description: "Submit a DRAFT expense for approval. Use this when the user asks to move an expense from draft to pending approval. Do NOT call create_expense again—that creates duplicates. Call submit_expense with the expense ID.",
    parameters: {
      type: Type.OBJECT,
      properties: { expenseId: { type: Type.STRING, description: "ID of the draft expense to submit" } },
      required: ["expenseId"],
    },
  },
  {
    name: "update_expense",
    description: "Update a DRAFT expense. Use when the user corrects data (e.g. amount, vendor, invoice number). Do NOT call create_expense—that creates duplicates. Only draft expenses can be updated.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenseId: { type: Type.STRING, description: "ID of the draft expense to update" },
        amount: { type: Type.NUMBER, description: "New amount in rupees (optional)" },
        vendorName: { type: Type.STRING, description: "Vendor name (optional)" },
        invoiceNumber: { type: Type.STRING, description: "Invoice number (optional)" },
        invoiceDate: { type: Type.STRING, description: "Invoice date YYYY-MM-DD (optional)" },
        expenseDate: { type: Type.STRING, description: "Expense date YYYY-MM-DD (optional)" },
        description: { type: Type.STRING, description: "Description (optional)" },
        categoryId: { type: Type.STRING, description: "Category ID (optional)" },
        campusId: { type: Type.STRING, description: "Campus ID (optional)" },
        gstin: { type: Type.STRING, description: "GSTIN (optional)" },
        taxType: { type: Type.STRING, description: "Tax type (optional)" },
      },
      required: ["expenseId"],
    },
  },
  {
    name: "delete_expense",
    description: "Delete a DRAFT expense. Use when the user says cancel, remove, or delete an expense. Only draft expenses can be deleted.",
    parameters: {
      type: Type.OBJECT,
      properties: { expenseId: { type: Type.STRING, description: "ID of the draft expense to delete" } },
      required: ["expenseId"],
    },
  },
  {
    name: "list_pending_approvals",
    description: "List expenses awaiting approval. For finance to see what needs review.",
    parameters: {
      type: Type.OBJECT,
      properties: { campusId: { type: Type.STRING } },
      required: [],
    },
  },
  {
    name: "list_role_change_requests",
    description: "List role change requests (e.g. pending guest onboarding).",
    parameters: {
      type: Type.OBJECT,
      properties: { status: { type: Type.STRING, description: "pending, approved, rejected" } },
      required: [],
    },
  },
  {
    name: "search_expenses",
    description: "Search expenses by vendor name, invoice number, or description.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING },
        limit: { type: Type.NUMBER },
      },
      required: ["query"],
    },
  },
  // Analytics (admin, finance only)
  {
    name: "expense_summary",
    description: "Get expense summary for a period: total amount, count, breakdown by status.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        campusId: { type: Type.STRING },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "pending_workload",
    description: "Get count of pending expense approvals and pending role change requests.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: "petty_cash_summary",
    description: "Get petty cash fund balances by campus.",
    parameters: {
      type: Type.OBJECT,
      properties: { campusId: { type: Type.STRING } },
      required: [],
    },
  },
  // Approve/reject (finance, admin)
  {
    name: "approve_expense",
    description: "Approve an expense that is pending approval. Finance only.",
    parameters: {
      type: Type.OBJECT,
      properties: { expenseId: { type: Type.STRING } },
      required: ["expenseId"],
    },
  },
  {
    name: "reject_expense",
    description: "Reject an expense with a reason. Finance only.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenseId: { type: Type.STRING },
        reason: { type: Type.STRING },
      },
      required: ["expenseId", "reason"],
    },
  },
  {
    name: "approve_role_request",
    description: "Approve a role change request. Admin/finance only.",
    parameters: {
      type: Type.OBJECT,
      properties: { requestId: { type: Type.STRING } },
      required: ["requestId"],
    },
  },
  {
    name: "reject_role_request",
    description: "Reject a role change request. Admin/finance only.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requestId: { type: Type.STRING },
        reason: { type: Type.STRING },
      },
      required: ["requestId"],
    },
  },
  {
    name: "record_payout",
    description: "Mark an approved expense as paid. Use when user says 'it's paid', 'payment done', 'paid out', etc. Finance/admin only.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenseId: { type: Type.STRING, description: "ID of the approved expense to mark as paid" },
        payoutMethod: {
          type: Type.STRING,
          description: "bank_transfer, upi, cash, cheque, or demand_draft. Default bank_transfer if user doesn't specify.",
        },
        payoutRef: {
          type: Type.STRING,
          description: "UTR, transaction ID, or reference. Use 'marked via WhatsApp' if user doesn't provide.",
        },
      },
      required: ["expenseId"],
    },
  },
];

const BASE_TOOLS = ["create_expense", "create_role_change_request", "store_pending_expense", "store_pending_role_change"];
const READ_TOOLS = ["list_expenses", "get_expense", "submit_expense", "update_expense", "delete_expense", "list_pending_approvals", "list_role_change_requests", "search_expenses", "bulk_create_expenses"];
const ANALYTICS_TOOLS = ["expense_summary", "pending_workload", "petty_cash_summary"];
const APPROVE_TOOLS = ["approve_expense", "reject_expense", "approve_role_request", "reject_role_request", "record_payout"];

const ROLES_WITH_READ = ["admin", "finance", "campus_coordinator", "head_office"];
const ROLES_WITH_ANALYTICS = ["admin", "finance"];
const ROLES_WITH_APPROVE = ["admin", "finance"];

export function getFunctionDeclarationsForRole(contactRole: string): FunctionDeclaration[] {
  const effectiveRole = contactRole === "coordinator" ? "campus_coordinator" : contactRole;
  const allowed = new Set(BASE_TOOLS);
  if (ROLES_WITH_READ.includes(effectiveRole)) READ_TOOLS.forEach((t) => allowed.add(t));
  if (ROLES_WITH_ANALYTICS.includes(effectiveRole)) ANALYTICS_TOOLS.forEach((t) => allowed.add(t));
  if (ROLES_WITH_APPROVE.includes(effectiveRole)) APPROVE_TOOLS.forEach((t) => allowed.add(t));
  return FINJOE_FUNCTION_DECLARATIONS.filter((f) => allowed.has(f.name)) as unknown as FunctionDeclaration[];
}

let ai: GoogleGenAI | null = null;

function getGemini() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn("GEMINI_API_KEY not configured - AI features disabled");
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export interface ExtractedExpense {
  amount?: number;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  description?: string;
  gstin?: string;
  taxType?: string;
}

export type ExtractedExpenseRow = {
  amount: number;
  description?: string;
  vendorName?: string;
  campus?: string;
};

export type ExtractionResult =
  | { type: "single"; expense: ExtractedExpense }
  | { type: "bulk"; expenses: ExtractedExpenseRow[] }
  | { type: "failed"; reason?: string };

/** Parse amount from number or string (handles "1,90,000.00" etc). Returns undefined if invalid. */
export function parseAmount(value: unknown): number | undefined {
  if (typeof value === "number") {
    const n = Math.round(value);
    return n > 0 ? n : undefined;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }
  return undefined;
}

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type AgentTurnInput = {
  userMessage: string;
  contactRole: string;
  contactName?: string | null;
  history: ConversationTurn[];
  systemContext: string;
  campuses: Array<{ id: string; name: string; slug: string }>;
  categories: Array<{ id: string; name: string; slug: string }>;
  pendingExpense?: {
    extracted: ExtractedExpense & { categoryId?: string; campusId?: string | null };
    missingFields: string[];
  };
  pendingRoleChange?: {
    requestedRole: string;
    name?: string | null;
    campusId?: string | null;
    campusName?: string | null;
    studentId?: string | null;
  };
  extractedFromImage?: ExtractedExpense;
  extractedBulkFromImage?: ExtractedExpenseRow[];
  extractionFailed?: boolean;
  traceId?: string;
};

export type AgentTurnResult = {
  text: string;
  functionCalls?: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>;
};

/** Send function results back to Gemini and get a natural language response */
export async function agentTurnWithFunctionResponse(
  input: AgentTurnInput,
  functionCallsAndResults: Array<{ name: string; args: Record<string, unknown>; result: unknown; thoughtSignature?: string }>,
  traceId?: string
): Promise<string> {
  const gemini = getGemini();
  if (!gemini) return "I'm having trouble processing that. Please try again later.";

  const {
    userMessage,
    contactRole,
    contactName,
    history,
    systemContext,
    campuses,
    categories,
    pendingExpense,
    pendingRoleChange,
    extractedFromImage,
    extractedBulkFromImage,
  } = input;

  const campusList = campuses.map((c) => `${c.name} (id: ${c.id})`).join(", ");
  const categoryList = categories.map((c) => `${c.name} (id: ${c.id})`).join(", ");
  let contextBlock = `${systemContext}\n\nAvailable campuses with IDs: ${campusList}\nExpense categories with IDs: ${categoryList}`;
  if (pendingExpense) {
    contextBlock += `\n\nPENDING EXPENSE—you have this data: ${JSON.stringify(pendingExpense.extracted)}. STILL MISSING: ${pendingExpense.missingFields.join(", ")}.`;
  }
  if (pendingRoleChange) {
    contextBlock += `\n\nPENDING ROLE CHANGE: ${pendingRoleChange.requestedRole}, name=${pendingRoleChange.name ?? "?"}, campus=${pendingRoleChange.campusName ?? pendingRoleChange.campusId ?? "?"}.`;
  }
  if (extractedFromImage && extractedFromImage.amount) {
    contextBlock += `\n\nEXTRACTED FROM INVOICE IMAGE: ${JSON.stringify(extractedFromImage)}.`;
  }
  if (extractedBulkFromImage?.length) {
    contextBlock += `\n\nEXTRACTED BULK EXPENSES (from table image or CSV): ${JSON.stringify(extractedBulkFromImage)}. Map each row's campus to campusId.`;
  }

  const historyText = history.length ? `\nRecent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join("\n")}\n` : "";
  const namePart = contactName ? ` (${contactName})` : "";
  const userContent = `User role: ${contactRole}${namePart}${historyText}\nCurrent message: "${userMessage}"`;
  const systemInstruction = `${FINJOE_SYSTEM_PROMPT}\n\n${contextBlock}\n\nRespond naturally based on the function results. Be warm and helpful.`;

  type Part = {
    text?: string;
    functionCall?: { name?: string; args?: Record<string, unknown>; thoughtSignature?: string; thought_signature?: string };
    functionResponse?: { name?: string; response?: Record<string, unknown> };
  };

  const contents: Array<{ role: string; parts: Part[] }> = [
    { role: "user", parts: [{ text: systemInstruction }] },
    { role: "user", parts: [{ text: userContent }] },
  ];

  for (const { name, args, result, thoughtSignature } of functionCallsAndResults) {
    const functionCallPart: Record<string, unknown> = { name, args };
    if (thoughtSignature) {
      functionCallPart.thought_signature = thoughtSignature;
    }
    contents.push({
      role: "model",
      parts: [{ functionCall: functionCallPart }],
    });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: typeof result === "object" && result !== null ? (result as Record<string, unknown>) : { result } } }],
    });
  }

  const doTurn = async (model: string) => {
    const response = await gemini.models.generateContent({
      model,
      contents,
      config: {
        tools: [{ functionDeclarations: getFunctionDeclarationsForRole(input.contactRole) }],
      },
    });
    type RespPart = { text?: string };
    const parts: RespPart[] = (response as { candidates?: Array<{ content?: { parts?: RespPart[] } }> }).candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text).filter(Boolean).join("").trim() || "Done. Let me know if you need anything else.";
  };

  try {
    return await doTurn(MODEL_ID);
  } catch (err) {
    logger.error("Agent turn with function response error", { traceId, err: String(err) });
    if (MODEL_ID !== FALLBACK_MODEL) {
      try {
        return await doTurn(FALLBACK_MODEL);
      } catch {
        return "I've processed that. Let me know if you need anything else.";
      }
    }
    return "I've processed that. Let me know if you need anything else.";
  }
}

/** Single agentic turn: model decides reply and/or function calls */
export async function agentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const gemini = getGemini();
  if (!gemini) {
    return { text: "I'm having trouble processing that. Please try again later." };
  }

  const {
    userMessage,
    contactRole,
    contactName,
    history,
    systemContext,
    campuses,
    categories,
    pendingExpense,
    pendingRoleChange,
    extractedFromImage,
    traceId,
  } = input;

  const campusList = campuses.map((c) => `${c.name} (id: ${c.id})`).join(", ");
  const categoryList = categories.map((c) => `${c.name} (id: ${c.id})`).join(", ");

  let contextBlock = `${systemContext}

Available campuses with IDs: ${campusList}
Expense categories with IDs: ${categoryList}`;

  if (pendingExpense) {
    contextBlock += `\n\nPENDING EXPENSE—you have this data: ${JSON.stringify(pendingExpense.extracted)}. STILL MISSING: ${pendingExpense.missingFields.join(", ")}. When the user's message fills any of these, use it. When all are filled, call create_expense.`;
  }
  if (pendingRoleChange) {
    contextBlock += `\n\nPENDING ROLE CHANGE: ${pendingRoleChange.requestedRole}, name=${pendingRoleChange.name ?? "?"}, campus=${pendingRoleChange.campusName ?? pendingRoleChange.campusId ?? "?"}.`;
  }
  if (extractedFromImage && extractedFromImage.amount) {
    contextBlock += `\n\nEXTRACTED FROM INVOICE IMAGE: ${JSON.stringify(extractedFromImage)}. Use create_expense if complete, or store_pending_expense and ask for missing fields.`;
  }
  if (input.extractedBulkFromImage?.length) {
    contextBlock += `\n\nEXTRACTED BULK EXPENSES (from table image or CSV): ${JSON.stringify(input.extractedBulkFromImage)}. Map each row's campus to campusId. Call bulk_create_expenses now with the expenses array.`;
  }
  if (input.extractionFailed) {
    contextBlock += `\n\nEXTRACTION ATTEMPTED: We tried to extract expense data from the image but could not reliably identify an amount. Please ask the user to type the amount and key details, or send a clearer image.`;
  }

  const historyText = history.length
    ? `\nRecent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join("\n")}\n`
    : "";
  const namePart = contactName ? ` (${contactName})` : "";

  const userContent = `User role: ${contactRole}${namePart}
${historyText}
Current message: "${userMessage}"`;

  const systemInstruction = `${FINJOE_SYSTEM_PROMPT}

${contextBlock}

Respond naturally. CRITICAL: Check PENDING EXPENSE and Missing fields. If the user's current message fills the last missing field (e.g. they say "chennai" when campus was missing), call create_expense now. If still missing fields, call store_pending_expense with updated missingFields and ask for the remaining ones (one or multiple—your choice). If you have amount and campus, call create_expense. Otherwise, reply with helpful text.`;

  const doAgentTurn = async (model: string) => {
    const response = await gemini.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [{ text: systemInstruction }] },
        { role: "user", parts: [{ text: userContent }] },
      ],
      config: {
        tools: [{ functionDeclarations: getFunctionDeclarationsForRole(contactRole) }],
      },
    });

    type Part = {
      text?: string;
      functionCall?: { name?: string; args?: Record<string, unknown>; thoughtSignature?: string; thought_signature?: string };
    };
    const parts: Part[] = (response as { candidates?: Array<{ content?: { parts?: Part[] } }> }).candidates?.[0]?.content?.parts ?? [];
    let text = "";
    const functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }> = [];
    for (const part of parts) {
      if (typeof part.text === "string") text += part.text;
      if (part.functionCall?.name) {
        const fc = part.functionCall;
        const thoughtSig = fc.thoughtSignature ?? (fc as Record<string, unknown>).thought_signature;
        functionCalls.push({
          name: fc.name as string,
          args: (fc.args ?? {}) as Record<string, unknown>,
          thoughtSignature: typeof thoughtSig === "string" ? thoughtSig : undefined,
        });
      }
    }
    text = text.trim() || "Got it, I'll process that.";
    return { text, functionCalls: functionCalls.length ? functionCalls : undefined };
  };

  try {
    return await doAgentTurn(MODEL_ID);
  } catch (err) {
    logger.error("Agent turn error", { traceId, err: String(err) });
    if (MODEL_ID !== FALLBACK_MODEL) {
      try {
        logger.info("Agent turn fallback to FALLBACK_MODEL", { traceId, fallback: FALLBACK_MODEL });
        return await doAgentTurn(FALLBACK_MODEL);
      } catch (fallbackErr) {
        logger.error("Agent turn fallback also failed", { traceId, err: String(fallbackErr) });
      }
    }
    return { text: "I'm having trouble right now. Please try again in a moment." };
  }
}

const EXTRACTED_EXPENSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: "number", description: "Amount in rupees (integer)" },
    vendorName: { type: "string", description: "Vendor/supplier name" },
    invoiceNumber: { type: "string", description: "Invoice number" },
    invoiceDate: { type: "string", description: "Invoice date YYYY-MM-DD" },
    description: { type: "string", description: "Description" },
    gstin: { type: "string", description: "GSTIN 15 chars if present" },
    taxType: {
      type: "string",
      enum: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"],
      description: "Tax type",
    },
  },
  required: [],
  additionalProperties: false,
} as const;

const EXTRACTION_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["single", "bulk"],
      description: "single for one invoice/receipt, bulk for a table of expenses",
    },
    expense: {
      type: "object",
      properties: {
        amount: { type: "number" },
        vendorName: { type: "string" },
        invoiceNumber: { type: "string" },
        invoiceDate: { type: "string" },
        description: { type: "string" },
        gstin: { type: "string" },
        taxType: { type: "string", enum: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"] },
      },
      description: "Use when type is single",
    },
    expenses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in rupees (required)" },
          description: { type: "string" },
          particulars: { type: "string", description: "Same as description, from Particulars column" },
          vendorName: { type: "string" },
          name: { type: "string", description: "Payee/vendor from Name column" },
          campus: { type: "string", description: "e.g. HO, Chennai, Hyderabad" },
        },
        required: ["amount"],
      },
      description: "Use when type is bulk - array of expense rows from a table",
    },
  },
  required: ["type"],
  additionalProperties: false,
} as const;

/** Extract expense data from image (base64) using structured output */
export async function extractExpenseFromImage(
  imageBase64: string,
  mimeType: string,
  textContext?: string,
  traceId?: string,
  systemContext?: string
): Promise<ExtractedExpense> {
  const gemini = getGemini();
  if (!gemini) return {};

  const ctxBlock = systemContext ? `\n${systemContext}\n` : "";
  const prompt = `${ctxBlock}Extract expense/invoice data from this image. Include only fields you can clearly identify. Use null for missing values. Amount should be in rupees (integer).
${textContext ? `Additional context from user: "${textContext}"` : ""}`;

  const parseJsonToExtracted = (json: Record<string, unknown>): ExtractedExpense => ({
    amount: typeof json.amount === "number" ? Math.round(json.amount) : undefined,
    vendorName: typeof json.vendorName === "string" ? json.vendorName : undefined,
    invoiceNumber: typeof json.invoiceNumber === "string" ? json.invoiceNumber : undefined,
    invoiceDate: typeof json.invoiceDate === "string" ? json.invoiceDate : undefined,
    description: typeof json.description === "string" ? json.description : undefined,
    gstin: typeof json.gstin === "string" ? json.gstin : undefined,
    taxType: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"].includes(String(json.taxType)) ? String(json.taxType) : undefined,
  });

  const doExtractStructured = async (model: string): Promise<ExtractedExpense> => {
    const response = await gemini.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTED_EXPENSE_JSON_SCHEMA,
      },
    });
    const text = (response as { text?: string })?.text?.trim() || "";
    const json = JSON.parse(text || "{}") as Record<string, unknown>;
    const result = parseJsonToExtracted(json);
    logger.info("Extraction result (structured)", { traceId, hasAmount: !!result.amount, extractedKeys: Object.keys(result) });
    return result;
  };

  const doExtractFallback = async (model: string): Promise<ExtractedExpense> => {
    const legacyPrompt = `${prompt}\n\nReturn ONLY a JSON object with: amount, vendorName, invoiceNumber, invoiceDate, description, gstin, taxType. Use null for missing. No other text.`;
    const response = await gemini.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: legacyPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
    });
    const text = (response as { text?: string })?.text?.trim() || "";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const json = JSON.parse(cleaned || "{}") as Record<string, unknown>;
    const result = parseJsonToExtracted(json);
    logger.info("Extraction result (fallback)", { traceId, hasAmount: !!result.amount, extractedKeys: Object.keys(result) });
    return result;
  };

  const doExtract = async (model: string): Promise<ExtractedExpense> => {
    try {
      return await doExtractStructured(model);
    } catch (structErr) {
      logger.warn("Structured extraction failed, falling back to legacy parse", { traceId, model, err: String(structErr) });
      return await doExtractFallback(model);
    }
  };

  try {
    return await doExtract(MODEL_ID);
  } catch (err) {
    logger.error("Expense extraction error", { traceId, err: String(err) });
    if (MODEL_ID !== FALLBACK_MODEL) {
      try {
        return await doExtract(FALLBACK_MODEL);
      } catch {
        logger.info("Extraction result (error fallback)", { traceId, hasAmount: false });
        return {};
      }
    }
    logger.info("Extraction result (error)", { traceId, hasAmount: false });
    return {};
  }
}

/** Extract single expense or bulk table from image. Returns ExtractionResult. */
export async function extractExpenseOrExpensesFromImage(
  imageBase64: string,
  mimeType: string,
  textContext?: string,
  traceId?: string,
  systemContext?: string
): Promise<ExtractionResult> {
  const gemini = getGemini();
  if (!gemini) return { type: "failed", reason: "Gemini not available" };

  const ctxBlock = systemContext ? `\n${systemContext}\n` : "";
  const prompt = `${ctxBlock}Extract expense data from this image.
- If this is a SINGLE invoice or receipt: return { "type": "single", "expense": { amount, vendorName?, invoiceNumber?, invoiceDate?, description?, gstin?, taxType? } }. Amount in rupees (integer). Use null for missing.
- If this is a TABLE (spreadsheet, list of rows with columns like Sl.No, Name, Particulars, Amount, Campus): return { "type": "bulk", "expenses": [ { "amount": N, "description"?, "vendorName"?, "campus"? }, ... ] }. Map: Name→vendorName, Particulars→description. Each row must have amount. Amount can be number or string (e.g. "1,90,000.00"). Campus can be HO, Chennai, Hyderabad, Bangalore, etc.
${textContext ? `Additional context from user: "${textContext}"` : ""}`;

  const parseRow = (r: Record<string, unknown>): ExtractedExpenseRow | null => {
    const amount = parseAmount(r.amount);
    if (amount == null) return null;
    return {
      amount,
      description: typeof r.description === "string" ? r.description : typeof r.particulars === "string" ? r.particulars : undefined,
      vendorName: typeof r.vendorName === "string" ? r.vendorName : typeof r.name === "string" ? r.name : undefined,
      campus: typeof r.campus === "string" ? r.campus : undefined,
    };
  };

  const parseToExtracted = (json: Record<string, unknown>): ExtractedExpense => ({
    amount: parseAmount(json.amount),
    vendorName: typeof json.vendorName === "string" ? json.vendorName : undefined,
    invoiceNumber: typeof json.invoiceNumber === "string" ? json.invoiceNumber : undefined,
    invoiceDate: typeof json.invoiceDate === "string" ? json.invoiceDate : undefined,
    description: typeof json.description === "string" ? json.description : undefined,
    gstin: typeof json.gstin === "string" ? json.gstin : undefined,
    taxType: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"].includes(String(json.taxType)) ? String(json.taxType) : undefined,
  });

  const doExtract = async (model: string): Promise<ExtractionResult> => {
    const response = await gemini.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_RESULT_JSON_SCHEMA,
      },
    });
    const text = (response as { text?: string })?.text?.trim() || "";
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text || "{}") as Record<string, unknown>;
    } catch (parseErr) {
      logger.warn("Extraction JSON parse failed", { traceId, rawPreview: text?.slice(0, 200) });
      return { type: "failed", reason: "Invalid JSON response" };
    }
    const type = json.type as string;

    if (type === "bulk" && Array.isArray(json.expenses)) {
      const rows = (json.expenses as Record<string, unknown>[])
        .map(parseRow)
        .filter((r): r is ExtractedExpenseRow => r !== null);
      if (rows.length > 0) {
        logger.info("Bulk extraction result", { traceId, count: rows.length });
        return { type: "bulk", expenses: rows };
      }
    }

    // Fallback: model may return expenses array with wrong/missing type
    if (Array.isArray(json.expenses) && json.expenses.length > 0) {
      const rows = (json.expenses as Record<string, unknown>[])
        .map(parseRow)
        .filter((r): r is ExtractedExpenseRow => r !== null);
      if (rows.length > 0) {
        logger.info("Bulk extraction result (fallback)", { traceId, count: rows.length });
        return { type: "bulk", expenses: rows };
      }
    }

    if (type === "single" && json.expense && typeof json.expense === "object") {
      const expense = parseToExtracted(json.expense as Record<string, unknown>);
      logger.info("Single extraction result", { traceId, hasAmount: !!expense.amount });
      return { type: "single", expense };
    }

    const singleExpense = parseToExtracted(json.expense as Record<string, unknown> ?? json);
    if (singleExpense.amount) {
      return { type: "single", expense: singleExpense };
    }

    logger.info("Extraction failed - no usable amount", { traceId, rawResponsePreview: text?.slice(0, 300) });
    return { type: "failed", reason: "Could not extract amount" };
  };

  try {
    return await doExtract(MODEL_ID);
  } catch (err) {
    logger.error("Extraction error", { traceId, err: String(err) });
    if (MODEL_ID !== FALLBACK_MODEL) {
      try {
        return await doExtract(FALLBACK_MODEL);
      } catch {
        return { type: "failed", reason: String(err) };
      }
    }
    return { type: "failed", reason: String(err) };
  }
}

