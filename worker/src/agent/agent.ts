import { db } from "../db.js";
import {
  finJoeContacts,
  finJoeMedia,
  finJoeTasks,
  finJoeMessages,
  finJoeConversations,
} from "../../../shared/schema.js";
import { eq, and, desc, or } from "drizzle-orm";
import { sendWith24hRouting, getExpenseApprovalTemplateConfig, notifySubmitterForApprovalRejection } from "../send.js";
import { logger } from "../logger.js";
import {
  agentTurn,
  agentTurnWithFunctionResponse,
  extractExpenseOrExpensesFromImage,
  parseAmount,
  type ExtractedExpense,
  type ConversationTurn,
} from "./gemini.js";
import { parseExpensesFromCsv } from "../csv-parser.js";
import { fetchSystemContext, fetchSystemData, resolveCategoryFromMessage, resolveCampusFromMessage } from "../context.js";
import { validateExpenseData, validateRoleChangeData } from "../validation.js";
import { createFinJoeData } from "../../../lib/finjoe-data.js";

const finJoeData = createFinJoeData(db);

const HISTORY_LIMIT = 10;

const USER_FACING_ERROR = "I couldn't save that right now. Please try again in a moment, or contact support if it persists.";

type PendingExpense = {
  type: "expense_pending";
  extracted: ExtractedExpense & { categoryId?: string; campusId?: string | null };
  missingFields: string[];
};

type PendingRoleChange = {
  type: "role_change_pending";
  requestedRole: string;
  name?: string | null;
  campusId?: string | null;
  campusName?: string | null;
  studentId?: string | null;
};

type ConversationContext = {
  pendingExpense?: PendingExpense;
  pendingRoleChange?: PendingRoleChange;
};

type FunctionResult<T = unknown> = { success: boolean; data?: T; error?: string };

/** Fetch recent conversation turns for context */
async function getConversationHistory(
  conversationId: string,
  excludeMessageId?: string
): Promise<ConversationTurn[]> {
  const limit = excludeMessageId ? HISTORY_LIMIT + 1 : HISTORY_LIMIT;
  const messages = await db
    .select({ id: finJoeMessages.id, direction: finJoeMessages.direction, body: finJoeMessages.body })
    .from(finJoeMessages)
    .where(eq(finJoeMessages.conversationId, conversationId))
    .orderBy(desc(finJoeMessages.createdAt))
    .limit(limit);
  const filtered = excludeMessageId
    ? messages.filter((m) => m.id !== excludeMessageId).slice(0, HISTORY_LIMIT)
    : messages;
  return filtered
    .reverse()
    .filter((m) => m.body)
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.body ?? "",
    }));
}

const CONTEXT_EXPIRY_HOURS = 24;

async function getConversationContext(conversationId: string): Promise<ConversationContext> {
  const [conv] = await db
    .select({ context: finJoeConversations.context, lastMessageAt: finJoeConversations.lastMessageAt })
    .from(finJoeConversations)
    .where(eq(finJoeConversations.id, conversationId))
    .limit(1);
  const raw = (conv?.context as ConversationContext) ?? {};
  if (!conv?.lastMessageAt) return raw;
  const ageMs = Date.now() - new Date(conv.lastMessageAt).getTime();
  if (ageMs > CONTEXT_EXPIRY_HOURS * 60 * 60 * 1000) {
    const { pendingExpense, pendingRoleChange, ...rest } = raw;
    return rest;
  }
  return raw;
}

async function setConversationContext(
  conversationId: string,
  context: Partial<ConversationContext>
): Promise<void> {
  const current = await getConversationContext(conversationId);
  const merged = { ...current, ...context };
  await db
    .update(finJoeConversations)
    .set({ context: merged, updatedAt: new Date() })
    .where(eq(finJoeConversations.id, conversationId));
}

function clearPendingFromContext(ctx: ConversationContext): Partial<ConversationContext> {
  const { pendingExpense, pendingRoleChange, ...rest } = ctx;
  return rest;
}

/** Process a message with AI: agentic turn with function calling */
export async function processWithAgent(
  conversationId: string,
  contactPhone: string,
  contactRole: string,
  contactStudentId: string | null,
  messageBody: string,
  messageId: string,
  traceId?: string,
  contactName?: string | null,
  contactCampusId?: string | null
): Promise<string> {
  const body = (messageBody || "").trim();
  const ctx = { traceId, conversationId, messageId };

  const systemContext = await fetchSystemContext();
  const { campuses, categories } = await fetchSystemData();
  const validCampusIds = campuses.map((c) => c.id);
  const validCategoryIds = categories.map((c) => c.id);

  const convContext = await getConversationContext(conversationId);
  const media = await db.select().from(finJoeMedia).where(eq(finJoeMedia.messageId, messageId));
  const isCsv = (ct: string | null) =>
    ct === "text/csv" || ct === "application/csv" || ct?.includes("csv");
  const isImageOrPdf = (ct: string | null) =>
    ct?.startsWith("image/") || ct === "application/pdf";
  const hasMedia = media.some((m) => isCsv(m.contentType) || isImageOrPdf(m.contentType));

  let extractedFromImage: ExtractedExpense | undefined;
  let extractedBulkFromImage: Array<{ amount: number; description?: string; vendorName?: string; campus?: string }> | undefined;
  let extractionFailed = false;

  if (hasMedia) {
    const firstCsv = media.find((m) => isCsv(m.contentType));
    const firstImage = media.find((m) => isImageOrPdf(m.contentType));

    if (firstCsv?.data) {
      logger.info("Parsing expense from CSV", { ...ctx, contentType: firstCsv.contentType });
      const rows = parseExpensesFromCsv(firstCsv.data);
      if (rows.length > 0) {
        extractedBulkFromImage = rows;
        logger.info("CSV parse result", { ...ctx, count: rows.length });
      } else {
        extractionFailed = true;
        logger.info("CSV parse yielded no valid rows", { ...ctx });
      }
    } else if (firstImage?.data) {
      logger.info("Extracting expense from media", { ...ctx, contentType: firstImage.contentType });
      const base64 = firstImage.data.toString("base64");
      const extractionResult = await extractExpenseOrExpensesFromImage(
        base64,
        firstImage.contentType,
        messageBody,
        traceId,
        systemContext
      );
      if (extractionResult.type === "single") {
        extractedFromImage = extractionResult.expense;
        extractionFailed = !extractionResult.expense.amount;
      } else if (extractionResult.type === "bulk") {
        extractedBulkFromImage = extractionResult.expenses;
      } else {
        extractionFailed = true;
      }
      logger.info("Extraction result", {
        ...ctx,
        type: extractionResult.type,
        hasAmount: extractionResult.type === "single" ? !!extractionResult.expense.amount : extractionResult.type === "bulk",
        extractedKeys: extractionResult.type === "single" ? Object.keys(extractionResult.expense ?? {}) : [],
      });
    }
  }

  const history = await getConversationHistory(conversationId, messageId);
  const effectiveUserMessage = (body || (hasMedia ? "[Image or file attached - please process the expense data]" : "")).trim();

  const turnResult = await agentTurn({
    userMessage: effectiveUserMessage,
    contactRole,
    contactName,
    history,
    systemContext,
    campuses,
    categories,
    pendingExpense: convContext.pendingExpense
      ? {
          extracted: convContext.pendingExpense.extracted,
          missingFields: convContext.pendingExpense.missingFields,
        }
      : undefined,
    pendingRoleChange: convContext.pendingRoleChange,
    extractedFromImage,
    extractedBulkFromImage,
    extractionFailed,
    traceId,
  });

  // Execute function calls and optionally get natural language response from model
  if (turnResult.functionCalls?.length) {
    logger.info("Agent function calls", { ...ctx, fns: turnResult.functionCalls.map((f) => f.name) });
    const functionCallsAndResults: Array<{ name: string; args: Record<string, unknown>; result: unknown; thoughtSignature?: string }> = [];
    let updatedConvContext = { ...convContext };
    // Gemini 3: only first parallel function call has thoughtSignature; use it for all if needed
    const firstThoughtSig = turnResult.functionCalls[0]?.thoughtSignature;

    const effectiveRole = contactRole === "coordinator" ? "campus_coordinator" : contactRole;
    for (const fc of turnResult.functionCalls) {
      const result = await executeFunctionCall(
        fc.name,
        fc.args,
        {
          conversationId,
          contactPhone,
          contactStudentId,
          contactRole: effectiveRole,
          contactCampusId: contactCampusId ?? null,
          convContext: updatedConvContext,
          validCategoryIds,
          validCampusIds,
          categories,
          campuses,
        },
        traceId
      );

      if (!result.success) {
        logger.error("Function call failed", { ...ctx, fn: fc.name, error: result.error });
        return result.error ?? USER_FACING_ERROR;
      }

      functionCallsAndResults.push({
        name: fc.name,
        args: fc.args,
        result: result.data ?? { success: true },
        thoughtSignature: fc.thoughtSignature ?? firstThoughtSig,
      });

      // Update context after successful store_pending
      if (fc.name === "store_pending_expense" && result.data) {
        updatedConvContext = { ...updatedConvContext, pendingExpense: result.data as PendingExpense };
        await setConversationContext(conversationId, updatedConvContext);
      } else if (fc.name === "store_pending_role_change" && result.data) {
        updatedConvContext = { ...updatedConvContext, pendingRoleChange: result.data as PendingRoleChange };
        await setConversationContext(conversationId, updatedConvContext);
      } else if (fc.name === "create_expense" || fc.name === "bulk_create_expenses" || fc.name === "create_role_change_request") {
        const cleared = clearPendingFromContext(updatedConvContext);
        await setConversationContext(conversationId, cleared);
        updatedConvContext = { ...updatedConvContext, ...cleared };
      }
    }

    // Send function results back to Gemini for a natural language response
    const finalText = await agentTurnWithFunctionResponse(
      {
        userMessage: effectiveUserMessage,
        contactRole,
        contactName,
        history,
        systemContext,
        campuses,
        categories,
        pendingExpense: updatedConvContext.pendingExpense
          ? { extracted: updatedConvContext.pendingExpense.extracted, missingFields: updatedConvContext.pendingExpense.missingFields }
          : undefined,
        pendingRoleChange: updatedConvContext.pendingRoleChange,
        extractedFromImage,
        extractedBulkFromImage,
        traceId,
      },
      functionCallsAndResults,
      traceId
    );
    return finalText;
  }

  if (!turnResult.functionCalls?.length) {
    logger.info("Agent no function calls", { ...ctx, textPreview: turnResult.text?.slice(0, 80) });
  }
  return turnResult.text;
}

type ExecuteContext = {
  conversationId: string;
  contactPhone: string;
  contactStudentId: string | null;
  contactRole: string;
  contactCampusId: string | null;
  convContext: ConversationContext;
  validCategoryIds: string[];
  validCampusIds: string[];
  categories: Array<{ id: string; name: string; slug: string }>;
  campuses: Array<{ id: string; name: string; slug: string }>;
};

async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
  execCtx: ExecuteContext,
  traceId?: string
): Promise<FunctionResult> {
  const { validCategoryIds, validCampusIds, contactPhone, contactStudentId, convContext } = execCtx;

  switch (name) {
    case "create_expense": {
      const amount = typeof args.amount === "number" ? Math.round(args.amount) : args.amount;
      let categoryId = String(args.categoryId ?? "");
      let campusId = args.campusId ? String(args.campusId) : null;
      if (categoryId && !validCategoryIds.includes(categoryId)) {
        const resolved = resolveCategoryFromMessage(categoryId, execCtx.categories);
        if (resolved) categoryId = resolved;
      }
      if (campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      const expenseData = {
        amount: amount ?? 0,
        expenseDate: String(args.invoiceDate ?? new Date().toISOString().slice(0, 10)),
        categoryId: categoryId || (validCategoryIds[0] ?? "operating_expenses"),
        campusId,
        description: args.description ? String(args.description) : null,
        invoiceNumber: args.invoiceNumber ? String(args.invoiceNumber) : null,
        invoiceDate: args.invoiceDate ? String(args.invoiceDate) : null,
        vendorName: args.vendorName ? String(args.vendorName) : null,
        gstin: args.gstin ? String(args.gstin) : null,
        taxType: args.taxType ? String(args.taxType) : null,
      };

      const validation = validateExpenseData(expenseData, validCategoryIds, validCampusIds);
      if (!validation.valid) {
        return { success: false, error: `I need: ${validation.errors.join(". ")}. Please provide the missing information.` };
      }

      const extracted: ExtractedExpense = {
        amount: expenseData.amount,
        vendorName: expenseData.vendorName ?? undefined,
        invoiceNumber: expenseData.invoiceNumber ?? undefined,
        invoiceDate: expenseData.invoiceDate ?? undefined,
        description: expenseData.description ?? undefined,
        gstin: expenseData.gstin ?? undefined,
        taxType: expenseData.taxType ?? undefined,
      };

      let expense: { id: string } | null = null;
      try {
        expense = await finJoeData.createExpense({
          campusId: expenseData.campusId,
          categoryId: expenseData.categoryId,
          amount: expenseData.amount,
          expenseDate: expenseData.expenseDate,
          description: expenseData.description ?? extracted.vendorName ?? "From FinJoe WhatsApp",
          invoiceNumber: expenseData.invoiceNumber,
          invoiceDate: expenseData.invoiceDate,
          vendorName: expenseData.vendorName,
          gstin: expenseData.gstin,
          taxType: expenseData.taxType,
          submittedByContactPhone: contactPhone,
        });
      } catch (err) {
        logger.error("Expense create error", { traceId, err: String(err) });
      }

      if (!expense?.id) {
        return { success: false, error: USER_FACING_ERROR };
      }

      await db.insert(finJoeTasks).values({
        conversationId: execCtx.conversationId,
        type: "expense_create",
        status: "completed",
        expenseId: expense.id,
        payload: { extracted, expenseId: expense.id },
      });
      await finJoeData.submitExpense(expense.id, contactStudentId);
      const categoryName = execCtx.categories.find((c) => c.id === expenseData.categoryId)?.name ?? null;
      await notifyFinanceForApproval(expense.id, extracted, traceId, categoryName);

      return { success: true, data: { expenseId: expense.id, extracted } };
    }

    case "bulk_create_expenses": {
      const BULK_MAX = 25;
      const rawExpenses = Array.isArray(args.expenses) ? args.expenses : [];
      if (rawExpenses.length === 0) {
        return { success: false, error: "No expenses provided. Pass an array of expense objects with amount." };
      }
      if (rawExpenses.length > BULK_MAX) {
        return { success: false, error: `Maximum ${BULK_MAX} expenses per bulk create. You sent ${rawExpenses.length}.` };
      }

      const today = new Date().toISOString().slice(0, 10);
      const defaultCategoryId = validCategoryIds[0] ?? "operating_expenses";
      const expenseItems: Array<{
        amount: number;
        expenseDate: string;
        categoryId: string;
        campusId: string | null;
        description: string | null;
        vendorName: string | null;
        invoiceDate: string | null;
        extracted: ExtractedExpense;
      }> = [];

      for (let i = 0; i < rawExpenses.length; i++) {
        const r = rawExpenses[i] as Record<string, unknown>;
        const amount = parseAmount(r.amount);
        if (amount == null) {
          return { success: false, error: `Expense ${i + 1}: amount must be a positive number.` };
        }
        let categoryId = String(r.categoryId ?? "").trim() || defaultCategoryId;
        const campusVal = r.campusId ?? r.campus;
        let campusId = campusVal != null && campusVal !== "" ? String(campusVal) : null;
        if (categoryId && !validCategoryIds.includes(categoryId)) {
          const resolved = resolveCategoryFromMessage(categoryId, execCtx.categories);
          if (resolved) categoryId = resolved;
        }
        if (campusId && !validCampusIds.includes(campusId)) {
          const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
          if (resolved) campusId = resolved;
        }
        const expenseDate = String(r.invoiceDate ?? r.expenseDate ?? today);
        const expenseData = {
          amount,
          expenseDate,
          categoryId: categoryId || defaultCategoryId,
          campusId,
          description: (r.description ?? r.particulars) ? String(r.description ?? r.particulars) : null,
          invoiceNumber: null as string | null,
          invoiceDate: r.invoiceDate ? String(r.invoiceDate) : null,
          vendorName: (r.vendorName ?? r.name) ? String(r.vendorName ?? r.name) : null,
          gstin: null as string | null,
          taxType: null as string | null,
        };
        const validation = validateExpenseData(expenseData, validCategoryIds, validCampusIds);
        if (!validation.valid) {
          return { success: false, error: `Expense ${i + 1}: ${validation.errors.join(". ")}` };
        }
        const extracted: ExtractedExpense = {
          amount: expenseData.amount,
          vendorName: expenseData.vendorName ?? undefined,
          description: expenseData.description ?? undefined,
          invoiceDate: expenseData.invoiceDate ?? undefined,
        };
        expenseItems.push({
          amount: expenseData.amount,
          expenseDate: expenseData.expenseDate,
          categoryId: expenseData.categoryId,
          campusId: expenseData.campusId,
          description: expenseData.description,
          vendorName: expenseData.vendorName,
          invoiceDate: expenseData.invoiceDate,
          extracted,
        });
      }

      const expenseIds: string[] = [];
      for (const item of expenseItems) {
        try {
          const expense = await finJoeData.createExpense({
            campusId: item.campusId,
            categoryId: item.categoryId,
            amount: item.amount,
            expenseDate: item.expenseDate,
            description: item.description ?? item.vendorName ?? "From FinJoe WhatsApp (bulk)",
            invoiceNumber: null,
            invoiceDate: item.invoiceDate,
            vendorName: item.vendorName,
            gstin: null,
            taxType: null,
            submittedByContactPhone: contactPhone,
          });
          if (expense?.id) {
            await db.insert(finJoeTasks).values({
              conversationId: execCtx.conversationId,
              type: "expense_create",
              status: "completed",
              expenseId: expense.id,
              payload: { extracted: item.extracted, expenseId: expense.id },
            });
            await finJoeData.submitExpense(expense.id, contactStudentId);
            const categoryName = execCtx.categories.find((c) => c.id === item.categoryId)?.name ?? null;
            await notifyFinanceForApproval(expense.id, item.extracted, traceId, categoryName);
            expenseIds.push(expense.id);
          }
        } catch (err) {
          logger.error("Bulk expense create error", { traceId, err: String(err) });
          return { success: false, error: USER_FACING_ERROR };
        }
      }

      return { success: true, data: { created: expenseIds.length, expenseIds } };
    }

    case "create_role_change_request": {
      const requestedRole = String(args.requestedRole ?? "");
      const name = String(args.name ?? "").trim();
      let campusId = args.campusId ? String(args.campusId) : null;
      const studentId = args.studentId ? String(args.studentId) : null;
      if (campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }

      const roleData = {
        contactPhone,
        requestedRole,
        name: name || undefined,
        campusId: campusId ?? undefined,
        studentId: studentId ?? undefined,
      };
      const validation = validateRoleChangeData(roleData, validCampusIds);
      if (!validation.valid) {
        return { success: false, error: `I need: ${validation.errors.join(". ")}. Please provide the missing information.` };
      }

      let created: { id: string } | null = null;
      try {
        created = await finJoeData.createRoleChangeRequest({
          contactPhone,
          requestedRole,
          name,
          campusId,
          studentId,
        });
      } catch (err) {
        logger.error("Role change request create error", { traceId, err: String(err) });
      }

      if (!created?.id) {
        return { success: false, error: USER_FACING_ERROR };
      }

      const campus = execCtx.campuses.find((c) => c.id === campusId);
      await notifyAdminForRoleRequest(created.id, name, requestedRole, campus?.name ?? null, traceId);

      return { success: true, data: { requestId: created.id, name, requestedRole } };
    }

    case "store_pending_expense": {
      const amount = typeof args.amount === "number" ? Math.round(args.amount) : args.amount;
      const missingFields = Array.isArray(args.missingFields) ? args.missingFields.map(String) : [];
      const extracted: ExtractedExpense & { categoryId?: string; campusId?: string | null } = {
        amount: amount ?? undefined,
        vendorName: args.vendorName ? String(args.vendorName) : undefined,
        invoiceNumber: args.invoiceNumber ? String(args.invoiceNumber) : undefined,
        invoiceDate: args.invoiceDate ? String(args.invoiceDate) : undefined,
        description: args.description ? String(args.description) : undefined,
        gstin: args.gstin ? String(args.gstin) : undefined,
        taxType: args.taxType ? String(args.taxType) : undefined,
      };
      return {
        success: true,
        data: {
          type: "expense_pending",
          extracted,
          missingFields,
        } as PendingExpense,
      };
    }

    case "store_pending_role_change": {
      const requestedRole = String(args.requestedRole ?? "");
      const name = args.name ? String(args.name) : null;
      const campusId = args.campusId ? String(args.campusId) : null;
      const campusName = args.campusName ? String(args.campusName) : null;
      const studentId = args.studentId ? String(args.studentId) : null;
      return {
        success: true,
        data: {
          type: "role_change_pending",
          requestedRole,
          name,
          campusId,
          campusName,
          studentId,
        } as PendingRoleChange,
      };
    }

    case "list_expenses": {
      let campusId = args.campusId ? String(args.campusId) : undefined;
      if (!campusId && execCtx.contactRole === "campus_coordinator" && execCtx.contactCampusId) {
        campusId = execCtx.contactCampusId;
      }
      const status = args.status ? String(args.status) : undefined;
      const categoryId = args.categoryId ? String(args.categoryId) : undefined;
      const startDate = args.startDate ? String(args.startDate) : undefined;
      const endDate = args.endDate ? String(args.endDate) : undefined;
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 100) : undefined;
      const rows = await finJoeData.listExpenses({ campusId, status, categoryId, startDate, endDate, limit });
      return { success: true, data: { expenses: rows } };
    }

    case "get_expense": {
      const expenseId = String(args.expenseId ?? "");
      const detail = await finJoeData.getExpenseWithDetails(expenseId);
      if (!detail) return { success: false, error: `Expense #${expenseId} not found.` };
      return { success: true, data: detail };
    }

    case "submit_expense": {
      const expenseId = String(args.expenseId ?? "");
      const result = await finJoeData.submitExpense(expenseId, contactStudentId);
      if (!result) return { success: false, error: `Could not submit expense #${expenseId}. It may not be in draft status or already submitted.` };
      return { success: true, data: { expenseId, submitted: true } };
    }

    case "update_expense": {
      const expenseId = String(args.expenseId ?? "");
      let categoryId = args.categoryId ? String(args.categoryId) : undefined;
      let campusId = args.campusId !== undefined ? (args.campusId ? String(args.campusId) : null) : undefined;
      if (categoryId && !validCategoryIds.includes(categoryId)) {
        const resolved = resolveCategoryFromMessage(categoryId, execCtx.categories);
        if (resolved) categoryId = resolved;
      }
      if (campusId !== undefined && campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      const updates: {
        amount?: number;
        campusId?: string | null;
        categoryId?: string;
        expenseDate?: string;
        description?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
        vendorName?: string | null;
        gstin?: string | null;
        taxType?: string | null;
      } = {};
      if (typeof args.amount === "number") updates.amount = Math.round(args.amount);
      if (args.vendorName !== undefined) updates.vendorName = args.vendorName ? String(args.vendorName) : null;
      if (args.invoiceNumber !== undefined) updates.invoiceNumber = args.invoiceNumber ? String(args.invoiceNumber) : null;
      if (args.invoiceDate !== undefined) updates.invoiceDate = args.invoiceDate ? String(args.invoiceDate) : null;
      if (args.expenseDate !== undefined) updates.expenseDate = String(args.expenseDate);
      if (args.description !== undefined) updates.description = args.description ? String(args.description) : null;
      if (categoryId) updates.categoryId = categoryId;
      if (campusId !== undefined) updates.campusId = campusId;
      if (args.gstin !== undefined) updates.gstin = args.gstin ? String(args.gstin) : null;
      if (args.taxType !== undefined) updates.taxType = args.taxType ? String(args.taxType) : null;
      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields to update. Specify at least one: amount, vendorName, invoiceNumber, invoiceDate, description, categoryId, campusId, gstin, taxType." };
      }
      const result = await finJoeData.updateExpense(expenseId, updates);
      if (!result) return { success: false, error: `Could not update expense #${expenseId}. It may not be in draft status.` };
      return { success: true, data: { expenseId, updated: true } };
    }

    case "delete_expense": {
      const expenseId = String(args.expenseId ?? "");
      const result = await finJoeData.deleteExpense(expenseId);
      if (!result) return { success: false, error: `Could not delete expense #${expenseId}. It may not exist or may not be in draft status.` };
      return { success: true, data: { expenseId, deleted: true } };
    }

    case "list_pending_approvals": {
      let campusId = args.campusId ? String(args.campusId) : undefined;
      if (!campusId && execCtx.contactRole === "campus_coordinator" && execCtx.contactCampusId) {
        campusId = execCtx.contactCampusId;
      }
      const rows = await finJoeData.listPendingApprovals(campusId);
      return { success: true, data: { pendingApprovals: rows } };
    }

    case "list_role_change_requests": {
      const status = args.status ? String(args.status) : undefined;
      const rows = await finJoeData.listRoleChangeRequests(status);
      return { success: true, data: { roleChangeRequests: rows } };
    }

    case "search_expenses": {
      const query = String(args.query ?? "").trim();
      if (!query) return { success: false, error: "Search query is required." };
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 20;
      const rows = await finJoeData.searchExpenses(query, limit);
      return { success: true, data: { expenses: rows } };
    }

    case "expense_summary": {
      const startDate = String(args.startDate ?? "");
      const endDate = String(args.endDate ?? "");
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const summary = await finJoeData.getExpenseSummary({ startDate, endDate, campusId });
      return { success: true, data: summary };
    }

    case "pending_workload": {
      const workload = await finJoeData.getPendingWorkload();
      return { success: true, data: workload };
    }

    case "petty_cash_summary": {
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const rows = await finJoeData.getPettyCashSummary(campusId);
      return { success: true, data: { pettyCashFunds: rows } };
    }

    case "approve_expense": {
      if (execCtx.contactRole !== "finance" && execCtx.contactRole !== "admin") {
        return { success: false, error: "Only finance or admin can approve expenses." };
      }
      if (!contactStudentId) return { success: false, error: "To approve via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const expenseId = String(args.expenseId ?? "");
      const result = await finJoeData.approveExpense(expenseId, contactStudentId);
      if (!result) return { success: false, error: `Could not approve expense #${expenseId}. It may not be pending.` };
      if (result.submittedByContactPhone) {
        notifySubmitterForApprovalRejection(result.submittedByContactPhone, expenseId, "approved", undefined, traceId).catch((err) =>
          logger.error("Failed to notify submitter of approval", { traceId, expenseId, err: String(err) })
        );
      }
      return { success: true, data: { expenseId, approved: true } };
    }

    case "reject_expense": {
      if (execCtx.contactRole !== "finance" && execCtx.contactRole !== "admin") {
        return { success: false, error: "Only finance or admin can reject expenses." };
      }
      if (!contactStudentId) return { success: false, error: "To approve or reject via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const expenseId = String(args.expenseId ?? "");
      const reason = String(args.reason ?? "Rejected via FinJoe");
      const result = await finJoeData.rejectExpense(expenseId, contactStudentId, reason);
      if (!result) return { success: false, error: `Could not reject expense #${expenseId}. It may not be pending.` };
      if (result.submittedByContactPhone) {
        notifySubmitterForApprovalRejection(result.submittedByContactPhone, expenseId, "rejected", reason, traceId).catch((err) =>
          logger.error("Failed to notify submitter of rejection", { traceId, expenseId, err: String(err) })
        );
      }
      return { success: true, data: { expenseId, rejected: true, reason } };
    }

    case "approve_role_request": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can approve role requests." };
      }
      if (!contactStudentId) return { success: false, error: "To approve role requests via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const requestId = String(args.requestId ?? "");
      const result = await finJoeData.approveRoleRequest(requestId, contactStudentId);
      if (!result) return { success: false, error: `Could not approve role request #${requestId}. It may not be pending.` };
      return { success: true, data: { requestId, approved: true } };
    }

    case "reject_role_request": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can reject role requests." };
      }
      if (!contactStudentId) return { success: false, error: "To approve or reject role requests via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const requestId = String(args.requestId ?? "");
      const reason = String(args.reason ?? "Rejected via FinJoe");
      const result = await finJoeData.rejectRoleRequest(requestId, contactStudentId, reason);
      if (!result) return { success: false, error: `Could not reject role request #${requestId}. It may not be pending.` };
      return { success: true, data: { requestId, rejected: true, reason } };
    }

    case "record_payout": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can record payout." };
      }
      if (!contactStudentId) return { success: false, error: "To record payout via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts." };
      const expenseId = String(args.expenseId ?? "");
      const payoutMethod = String(args.payoutMethod ?? "bank_transfer").trim() || "bank_transfer";
      const payoutRef = String(args.payoutRef ?? "marked via FinJoe WhatsApp").trim() || "marked via FinJoe WhatsApp";
      const result = await finJoeData.recordExpensePayout(expenseId, payoutMethod, payoutRef);
      if (!result) return { success: false, error: `Could not record payout for expense #${expenseId}. It may not be approved.` };
      return { success: true, data: { expenseId, paid: true, payoutMethod, payoutRef } };
    }

    default:
      return { success: false, error: `Unknown function: ${name}` };
  }
}

/** Notify admin/finance about role change request */
async function notifyAdminForRoleRequest(
  requestId: string,
  name: string,
  requestedRole: string,
  campusName: string | null,
  traceId?: string
) {
  const financeAndAdmin = await db
    .select()
    .from(finJoeContacts)
    .where(
      and(
        eq(finJoeContacts.isActive, true),
        or(eq(finJoeContacts.role, "admin"), eq(finJoeContacts.role, "finance"))
      )
    );
  const msg = `Role change request #${requestId}: ${name} wants to become ${requestedRole}${campusName ? ` (Campus: ${campusName})` : ""}. Reply APPROVE ROLE ${requestId} or REJECT ROLE ${requestId} to act.`;
  for (const c of financeAndAdmin) {
    try {
      await sendWith24hRouting(c.phone, msg, null, traceId);
    } catch (err) {
      logger.error("Failed to notify admin for role request", { traceId, phone: c.phone, err: String(err) });
    }
  }
}

/** Notify finance contacts about expense needing approval */
async function notifyFinanceForApproval(
  expenseId: string,
  extracted: ExtractedExpense,
  traceId?: string,
  categoryName?: string | null
) {
  const financeContacts = await db
    .select()
    .from(finJoeContacts)
    .where(and(eq(finJoeContacts.role, "finance"), eq(finJoeContacts.isActive, true)));
  const lineItem = extracted.description || categoryName || extracted.vendorName;
  const msg = `New expense #${expenseId} needs approval: ₹${extracted.amount?.toLocaleString("en-IN")}${lineItem ? ` - ${lineItem}` : ""}. Reply APPROVE ${expenseId} or REJECT ${expenseId} to act.`;
  const templateConfig = await getExpenseApprovalTemplateConfig(
    expenseId,
    extracted.amount ?? 0,
    extracted.vendorName,
    extracted.description,
    categoryName
  );
  logger.info("Notifying finance for approval", { traceId, expenseId, count: financeContacts.length });
  for (const c of financeContacts) {
    try {
      await sendWith24hRouting(c.phone, msg, templateConfig, traceId);
    } catch (err) {
      logger.error("Failed to notify finance", { traceId, phone: c.phone, err: String(err) });
    }
  }
}
