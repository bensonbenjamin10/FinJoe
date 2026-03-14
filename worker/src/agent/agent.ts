import { db, pool } from "../db.js";
import {
  finJoeContacts,
  finJoeMedia,
  finJoeTasks,
  finJoeMessages,
  finJoeConversations,
  users,
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
import { fetchSystemContext, fetchSystemData, resolveCategoryFromMessage, resolveCampusFromMessage, resolveIncomeCategoryFromMessage, type DataCollectionSettings } from "../context.js";
import { validateExpenseData, validateRoleChangeData } from "../validation.js";
import { createFinJoeData } from "../../../lib/finjoe-data.js";
import { toShortExpenseId } from "../../../lib/expense-id.js";
import { getMedia } from "../../../lib/media-storage.js";
import { parseExpenseQuery, parseDateToISO } from "../../../lib/expense-query-ai.js";
import { embedQuery } from "../../../lib/expense-embeddings.js";
import { normalizePhone } from "../twilio.js";

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

type PendingConfirmation = {
  type: "expense" | "income";
  data: Record<string, unknown>;
};

type ConversationContext = {
  pendingExpense?: PendingExpense;
  pendingRoleChange?: PendingRoleChange;
  pendingConfirmation?: PendingConfirmation;
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
    const { pendingExpense, pendingRoleChange, pendingConfirmation, ...rest } = raw;
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
  const { pendingExpense, pendingRoleChange, pendingConfirmation, ...rest } = ctx;
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
  traceId: string | undefined,
  tenantId: string,
  contactName?: string | null,
  contactCampusId?: string | null
): Promise<string> {
  const body = (messageBody || "").trim();
  const ctx = { traceId, conversationId, messageId };

  const { context: systemContext, costCenterLabel, dataCollectionSettings } = await fetchSystemContext(tenantId);
  const { campuses, categories, incomeCategories } = await fetchSystemData(tenantId);
  const validCampusIds = campuses.map((c) => c.id);
  const validCategoryIds = categories.map((c) => c.id);
  const validIncomeCategoryIds = incomeCategories.map((c) => c.id);

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

    const firstCsvBuffer = firstCsv?.data ?? (firstCsv?.storagePath ? await getMedia(firstCsv.storagePath) : null);
    const firstImageBuffer = firstImage?.data ?? (firstImage?.storagePath ? await getMedia(firstImage.storagePath) : null);
    if (firstCsvBuffer) {
      logger.info("Parsing expense from CSV", { ...ctx, contentType: firstCsv!.contentType });
      const rows = parseExpensesFromCsv(firstCsvBuffer);
      if (rows.length > 0) {
        extractedBulkFromImage = rows;
        logger.info("CSV parse result", { ...ctx, count: rows.length });
      } else {
        extractionFailed = true;
        logger.info("CSV parse yielded no valid rows", { ...ctx });
      }
    } else if (firstImageBuffer) {
      logger.info("Extracting expense from media", { ...ctx, contentType: firstImage!.contentType });
      const base64 = firstImageBuffer.toString("base64");
      const extractionResult = await extractExpenseOrExpensesFromImage(
        base64,
        firstImage!.contentType,
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
    } else {
      extractionFailed = true;
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
    costCenterLabel,
    campuses,
    categories,
    incomeCategories,
    pendingExpense: convContext.pendingExpense
      ? {
          extracted: convContext.pendingExpense.extracted,
          missingFields: convContext.pendingExpense.missingFields,
        }
      : undefined,
    pendingRoleChange: convContext.pendingRoleChange,
    pendingConfirmation: convContext.pendingConfirmation ? { type: convContext.pendingConfirmation.type } : undefined,
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
          validIncomeCategoryIds,
          validCampusIds,
          categories,
          incomeCategories,
          campuses,
          tenantId,
          messageId,
          dataCollectionSettings,
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
      } else if (fc.name === "create_expense" || fc.name === "create_income" || fc.name === "bulk_create_expenses" || fc.name === "create_role_change_request") {
        const cleared = clearPendingFromContext(updatedConvContext);
        await setConversationContext(conversationId, cleared);
        updatedConvContext = { ...updatedConvContext, ...cleared };
      } else if (fc.name === "confirm_expense" || fc.name === "confirm_income") {
        const cleared = clearPendingFromContext(updatedConvContext);
        await setConversationContext(conversationId, cleared);
        updatedConvContext = { ...updatedConvContext, ...cleared };
      } else if ((fc.name === "create_expense" || fc.name === "create_income") && result.data && typeof result.data === "object" && (result.data as { confirmRequired?: boolean }).confirmRequired) {
        updatedConvContext = await getConversationContext(conversationId);
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
        costCenterLabel,
        campuses,
        categories,
        incomeCategories,
        pendingExpense: updatedConvContext.pendingExpense
          ? { extracted: updatedConvContext.pendingExpense.extracted, missingFields: updatedConvContext.pendingExpense.missingFields }
          : undefined,
        pendingRoleChange: updatedConvContext.pendingRoleChange,
        pendingConfirmation: updatedConvContext.pendingConfirmation ? { type: updatedConvContext.pendingConfirmation.type } : undefined,
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
  validIncomeCategoryIds: string[];
  validCampusIds: string[];
  categories: Array<{ id: string; name: string; slug: string }>;
  incomeCategories: Array<{ id: string; name: string; slug: string }>;
  campuses: Array<{ id: string; name: string; slug: string }>;
  tenantId: string;
  messageId?: string;
  dataCollectionSettings?: DataCollectionSettings;
};

async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
  execCtx: ExecuteContext,
  traceId?: string
): Promise<FunctionResult> {
  const { validCategoryIds, validCampusIds, contactPhone, contactStudentId, convContext, tenantId } = execCtx;
  const finJoeData = createFinJoeData(db, tenantId, pool);
  const dataCollectionSettings = execCtx.dataCollectionSettings;
  const requireConfirmation = dataCollectionSettings?.requireConfirmationBeforePost ?? false;
  const requireAuditAbove = dataCollectionSettings?.requireAuditFieldsAboveAmount ?? null;

  switch (name) {
    case "confirm_expense": {
      const pending = convContext.pendingConfirmation;
      if (!pending || pending.type !== "expense") {
        return { success: false, error: "Nothing to confirm. Please provide the expense details again." };
      }
      const d = pending.data as {
        amount: number;
        expenseDate: string;
        categoryId: string;
        campusId: string | null;
        description?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
        vendorName?: string | null;
        gstin?: string | null;
        taxType?: string | null;
      };
      let expense: { id: string } | null = null;
      try {
        expense = await finJoeData.createExpense({
          tenantId,
          costCenterId: d.campusId,
          categoryId: d.categoryId,
          amount: d.amount,
          expenseDate: d.expenseDate,
          description: d.description ?? d.vendorName ?? "From FinJoe WhatsApp",
          invoiceNumber: d.invoiceNumber ?? null,
          invoiceDate: d.invoiceDate ?? null,
          vendorName: d.vendorName ?? null,
          gstin: d.gstin ?? null,
          taxType: d.taxType ?? null,
          submittedByContactPhone: contactPhone,
        });
      } catch (err) {
        logger.error("Confirm expense create error", { traceId, err: String(err) });
      }
      if (!expense?.id) return { success: false, error: USER_FACING_ERROR };
      await finJoeData.submitExpense(expense.id, contactStudentId);
      const categoryName = execCtx.categories.find((c) => c.id === d.categoryId)?.name ?? null;
      await notifyFinanceForApproval(expense.id, { amount: d.amount, vendorName: d.vendorName, invoiceNumber: d.invoiceNumber, invoiceDate: d.invoiceDate, description: d.description, gstin: d.gstin, taxType: d.taxType }, tenantId, traceId, categoryName);
      return { success: true, data: { expenseId: expense.id } };
    }

    case "confirm_income": {
      const pending = convContext.pendingConfirmation;
      if (!pending || pending.type !== "income") {
        return { success: false, error: "Nothing to confirm. Please provide the income details again." };
      }
      const d = pending.data as { amount: number; categoryId: string; campusId: string | null; particulars?: string | null; incomeDate: string };
      try {
        await finJoeData.createIncome({
          tenantId,
          costCenterId: d.campusId,
          categoryId: d.categoryId,
          amount: d.amount,
          incomeDate: d.incomeDate,
          particulars: d.particulars ?? null,
          submittedByContactPhone: contactPhone,
        });
      } catch (err) {
        logger.error("Confirm income create error", { traceId, err: String(err) });
        return { success: false, error: USER_FACING_ERROR };
      }
      return { success: true, data: {} };
    }

    case "create_expense": {
      if (validCategoryIds.length === 0) {
        return { success: false, error: "No expense categories configured. Ask admin to add categories in FinJoe Settings." };
      }
      const amountVal = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      const amount = amountVal ?? 0;
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
        expenseDate: parseDateToISO(String(args.invoiceDate ?? new Date().toISOString().slice(0, 10))) ?? new Date().toISOString().slice(0, 10),
        categoryId: categoryId || validCategoryIds[0] || "",
        campusId,
        description: args.description ? String(args.description) : null,
        invoiceNumber: args.invoiceNumber ? String(args.invoiceNumber) : null,
        invoiceDate: args.invoiceDate ? (parseDateToISO(String(args.invoiceDate)) ?? String(args.invoiceDate)) : null,
        vendorName: args.vendorName ? String(args.vendorName) : null,
        gstin: args.gstin ? String(args.gstin) : null,
        taxType: args.taxType ? String(args.taxType) : null,
      };

      const validation = validateExpenseData(expenseData, validCategoryIds, validCampusIds, requireAuditAbove);
      if (!validation.valid) {
        return { success: false, error: `I need: ${validation.errors.join(". ")}. Please provide the missing information.` };
      }

      // Require confirmation before posting: store/update pending and ask user to confirm (handles user corrections too)
      if (requireConfirmation) {
        const campusName = campusId ? execCtx.campuses.find((c) => c.id === campusId)?.name ?? campusId : "Corporate Office";
        const summary = `₹${expenseData.amount.toLocaleString("en-IN")} for ${campusName}${expenseData.vendorName ? ` (${expenseData.vendorName})` : ""}`;
        await setConversationContext(execCtx.conversationId, {
          ...convContext,
          pendingConfirmation: { type: "expense", data: { ...expenseData, vendorName: expenseData.vendorName } },
        });
        return {
          success: true,
          data: {
            confirmRequired: true,
            message: `Please ask the user to confirm: "${summary}". Reply yes to confirm. When they confirm, call confirm_expense.`,
          },
        };
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
          tenantId,
          costCenterId: expenseData.campusId,
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
        tenantId,
        conversationId: execCtx.conversationId,
        type: "expense_create",
        status: "completed",
        expenseId: expense.id,
        payload: { extracted, expenseId: expense.id },
      });
      if (execCtx.messageId) {
        await db.update(finJoeMedia).set({ expenseId: expense.id }).where(eq(finJoeMedia.messageId, execCtx.messageId));
      }
      await finJoeData.submitExpense(expense.id, contactStudentId);
      const categoryName = execCtx.categories.find((c) => c.id === expenseData.categoryId)?.name ?? null;
      await notifyFinanceForApproval(expense.id, extracted, tenantId, traceId, categoryName);

      return { success: true, data: { expenseId: expense.id, extracted } };
    }

    case "create_income": {
      const { validIncomeCategoryIds, incomeCategories: incCats } = execCtx;
      if (validIncomeCategoryIds.length === 0) {
        return { success: false, error: "No income categories configured. Ask admin to add income categories in the web app (Income settings)." };
      }
      const amountVal = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      const amount = amountVal ?? 0;
      if (amount <= 0) {
        return { success: false, error: "Income amount must be a positive number." };
      }
      let categoryId = String(args.categoryId ?? "").trim();
      let campusId = args.campusId ? String(args.campusId) : null;
      if (categoryId && !validIncomeCategoryIds.includes(categoryId)) {
        const resolved = resolveIncomeCategoryFromMessage(categoryId, incCats);
        if (resolved) categoryId = resolved;
      }
      if (campusId && !execCtx.validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      const finalCategoryId = categoryId || validIncomeCategoryIds[0];
      if (!finalCategoryId) {
        return { success: false, error: "No income categories configured. Ask admin to add income categories." };
      }
      const incomeDate = parseDateToISO(String(args.incomeDate ?? new Date().toISOString().slice(0, 10))) ?? new Date().toISOString().slice(0, 10);
      const particulars = args.particulars ? String(args.particulars) : null;

      const incomeData = {
        amount,
        categoryId: finalCategoryId,
        campusId,
        particulars: particulars ?? null,
        incomeDate,
      };

      // Require confirmation before posting: store/update pending and ask user to confirm (handles user corrections too)
      if (requireConfirmation) {
        const campusName = campusId ? execCtx.campuses.find((c) => c.id === campusId)?.name ?? campusId : "Corporate Office";
        const catName = incCats.find((c) => c.id === finalCategoryId)?.name ?? "Income";
        const summary = `₹${amount.toLocaleString("en-IN")} ${catName} for ${campusName}${particulars ? ` (${particulars})` : ""}`;
        await setConversationContext(execCtx.conversationId, {
          ...convContext,
          pendingConfirmation: { type: "income", data: incomeData },
        });
        return {
          success: true,
          data: {
            confirmRequired: true,
            message: `Please ask the user to confirm: "${summary}". Reply yes to confirm. When they confirm, call confirm_income.`,
          },
        };
      }

      let income: { id: string } | null = null;
      try {
        income = await finJoeData.createIncome({
          tenantId,
          costCenterId: campusId,
          categoryId: incomeData.categoryId,
          amount: incomeData.amount,
          incomeDate: incomeData.incomeDate,
          particulars: incomeData.particulars ?? "From FinJoe WhatsApp",
          incomeType: args.incomeType ? String(args.incomeType) : "other",
          submittedByContactPhone: contactPhone,
        });
      } catch (err) {
        logger.error("Income create error", { traceId, err: String(err) });
      }

      if (!income?.id) {
        return { success: false, error: USER_FACING_ERROR };
      }

      const categoryName = incCats.find((c) => c.id === finalCategoryId)?.name ?? null;
      return { success: true, data: { incomeId: income.id, amount, categoryName, incomeDate } };
    }

    case "bulk_create_expenses": {
      if (validCategoryIds.length === 0) {
        return { success: false, error: "No expense categories configured. Ask admin to add categories in FinJoe Settings." };
      }
      const BULK_MAX = 25;
      const rawExpenses = Array.isArray(args.expenses) ? args.expenses : [];
      if (rawExpenses.length === 0) {
        return { success: false, error: "No expenses provided. Pass an array of expense objects with amount." };
      }
      if (rawExpenses.length > BULK_MAX) {
        return { success: false, error: `Maximum ${BULK_MAX} expenses per bulk create. You sent ${rawExpenses.length}.` };
      }

      const today = new Date().toISOString().slice(0, 10);
      const defaultCategoryId = validCategoryIds[0];
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
        const rawDate = String(r.invoiceDate ?? r.expenseDate ?? today);
        const expenseDate = parseDateToISO(rawDate) ?? rawDate;
        const expenseData = {
          amount,
          expenseDate,
          categoryId: categoryId || defaultCategoryId,
          campusId,
          description: (r.description ?? r.particulars) ? String(r.description ?? r.particulars) : null,
          invoiceNumber: null as string | null,
          invoiceDate: r.invoiceDate ? (parseDateToISO(String(r.invoiceDate)) ?? String(r.invoiceDate)) : null,
          vendorName: (r.vendorName ?? r.name) ? String(r.vendorName ?? r.name) : null,
          gstin: null as string | null,
          taxType: null as string | null,
        };
        const validation = validateExpenseData(expenseData, validCategoryIds, validCampusIds, requireAuditAbove);
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
            tenantId,
            costCenterId: item.campusId,
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
              tenantId,
              conversationId: execCtx.conversationId,
              type: "expense_create",
              status: "completed",
              expenseId: expense.id,
              payload: { extracted: item.extracted, expenseId: expense.id },
            });
            await finJoeData.submitExpense(expense.id, contactStudentId);
            const categoryName = execCtx.categories.find((c) => c.id === item.categoryId)?.name ?? null;
            await notifyFinanceForApproval(expense.id, item.extracted, tenantId, traceId, categoryName);
            expenseIds.push(expense.id);
          }
        } catch (err) {
          logger.error("Bulk expense create error", { traceId, err: String(err) });
          return { success: false, error: USER_FACING_ERROR };
        }
      }
      if (execCtx.messageId && expenseIds.length > 0) {
        await db.update(finJoeMedia).set({ expenseId: expenseIds[0] }).where(eq(finJoeMedia.messageId, execCtx.messageId));
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
          tenantId,
          contactPhone,
          requestedRole,
          name,
          costCenterId: campusId,
          studentId,
        });
      } catch (err) {
        logger.error("Role change request create error", { traceId, err: String(err) });
      }

      if (!created?.id) {
        return { success: false, error: USER_FACING_ERROR };
      }

      const campus = execCtx.campuses.find((c) => c.id === campusId);
      await notifyAdminForRoleRequest(created.id, name, requestedRole, campus?.name ?? null, tenantId, traceId);

      return { success: true, data: { requestId: created.id, name, requestedRole } };
    }

    case "store_pending_expense": {
      if (validCategoryIds.length === 0) {
        return { success: false, error: "No expense categories configured. Ask admin to add categories in FinJoe Settings." };
      }
      const amountVal = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      const missingFields = Array.isArray(args.missingFields) ? args.missingFields.map(String) : [];
      const extracted: ExtractedExpense & { categoryId?: string; campusId?: string | null } = {
        amount: amountVal ?? undefined,
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
      const rows = await finJoeData.listExpenses({ costCenterId: campusId, campusId, status, categoryId, startDate, endDate, limit });
      return { success: true, data: { expenses: rows } };
    }

    case "get_expense": {
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const detail = await finJoeData.getExpenseWithDetails(expenseId);
      if (!detail) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      return { success: true, data: detail };
    }

    case "submit_expense": {
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const result = await finJoeData.submitExpense(expenseId, contactStudentId);
      if (!result) return { success: false, error: `Could not submit expense #${expenseIdInput}. It may not be in draft status or already submitted.` };
      return { success: true, data: { expenseId, submitted: true } };
    }

    case "update_expense": {
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
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
        costCenterId?: string | null;
        categoryId?: string;
        expenseDate?: string;
        description?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
        vendorName?: string | null;
        gstin?: string | null;
        taxType?: string | null;
      } = {};
      const amt = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      if (amt !== undefined) updates.amount = amt;
      if (args.vendorName !== undefined) updates.vendorName = args.vendorName ? String(args.vendorName) : null;
      if (args.invoiceNumber !== undefined) updates.invoiceNumber = args.invoiceNumber ? String(args.invoiceNumber) : null;
      if (args.invoiceDate !== undefined) updates.invoiceDate = args.invoiceDate ? (parseDateToISO(String(args.invoiceDate)) ?? String(args.invoiceDate)) : null;
      if (args.expenseDate !== undefined) updates.expenseDate = parseDateToISO(String(args.expenseDate)) ?? String(args.expenseDate);
      if (args.description !== undefined) updates.description = args.description ? String(args.description) : null;
      if (categoryId) updates.categoryId = categoryId;
      if (campusId !== undefined) updates.costCenterId = campusId;
      if (args.gstin !== undefined) updates.gstin = args.gstin ? String(args.gstin) : null;
      if (args.taxType !== undefined) updates.taxType = args.taxType ? String(args.taxType) : null;
      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields to update. Specify at least one: amount, vendorName, invoiceNumber, invoiceDate, description, categoryId, campusId, gstin, taxType." };
      }
      const result = await finJoeData.updateExpense(expenseId, updates);
      if (!result) return { success: false, error: `Could not update expense #${expenseIdInput}. It may not be in draft status.` };
      return { success: true, data: { expenseId, updated: true } };
    }

    case "delete_expense": {
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const result = await finJoeData.deleteExpense(expenseId);
      if (!result) return { success: false, error: `Could not delete expense #${expenseIdInput}. It may not exist or may not be in draft status.` };
      return { success: true, data: { expenseId, deleted: true } };
    }

    case "list_pending_approvals": {
      let campusId = args.campusId ? String(args.campusId) : undefined;
      if (!campusId && execCtx.contactRole === "campus_coordinator" && execCtx.contactCampusId) {
        campusId = execCtx.contactCampusId;
      }
      const rows = await finJoeData.listPendingApprovals(campusId ?? undefined);
      return { success: true, data: { pendingApprovals: rows } };
    }

    case "list_role_change_requests": {
      const status = args.status ? String(args.status) : undefined;
      const rows = await finJoeData.listRoleChangeRequests(status);
      return { success: true, data: { roleChangeRequests: rows } };
    }

    case "semantic_search_expenses": {
      const question = String(args.question ?? "").trim();
      if (!question) return { success: false, error: "Please provide a question about expenses." };
      const parsed = await parseExpenseQuery(question, execCtx.campuses);
      if (!parsed) {
        return {
          success: true,
          data: {
            message: "I couldn't parse that question. Try asking with specific keywords like 'stationery' or 'travel', and a time range like 'last month'.",
            expenses: [],
            summary: null,
          },
        };
      }
      const searchQuery = parsed.searchQuery ?? question;
      const startDate = parsed.startDate; // Already normalized by parseExpenseQuery (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
      const endDate = parsed.endDate;
      const campusId = parsed.campusId ?? undefined;
      let searchResults: Array<Record<string, unknown>> = [];
      const queryEmbedding = await embedQuery(question);
      if (queryEmbedding) {
        searchResults = await finJoeData.searchExpensesByEmbedding(queryEmbedding, 20, {
          startDate,
          endDate,
          campusId: campusId ?? null,
        });
      }
      if (searchResults.length === 0) {
        searchResults = await finJoeData.searchExpenses(searchQuery, 20);
      }
      const listResults = await finJoeData.listExpenses({
        startDate,
        endDate,
        campusId: campusId ?? null,
        limit: 20,
      });
      const combinedIds = new Set([...searchResults.map((r: any) => r.id), ...listResults.map((r: any) => r.id)]);
      const byId = new Map([...searchResults.map((r: any) => [r.id, r]), ...listResults.map((r: any) => [r.id, r])]);
      const expenses = Array.from(byId.values()).slice(0, 20);
      let summary = null;
      if (startDate && endDate) {
        summary = await finJoeData.getExpenseSummary({ startDate, endDate, campusId });
      }
      return {
        success: true,
        data: {
          expenses,
          summary,
          parsedQuery: { searchQuery, startDate, endDate, campusId },
        },
      };
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
      const summary = await finJoeData.getExpenseSummary({ startDate, endDate, costCenterId: campusId, campusId });
      return { success: true, data: summary };
    }

    case "pending_workload": {
      const workload = await finJoeData.getPendingWorkload();
      return { success: true, data: workload };
    }

    case "dashboard_summary": {
      const startDate = args.startDate ? String(args.startDate) : undefined;
      const endDate = args.endDate ? String(args.endDate) : undefined;
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const summary = await finJoeData.getDashboardSummary({ startDate, endDate, campusId });
      return { success: true, data: summary };
    }

    case "petty_cash_summary": {
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const rows = await finJoeData.getPettyCashSummary(campusId ?? undefined);
      return { success: true, data: { pettyCashFunds: rows } };
    }

    case "approve_expense": {
      if (execCtx.contactRole !== "finance" && execCtx.contactRole !== "admin") {
        return { success: false, error: "Only finance or admin can approve expenses." };
      }
      if (!contactStudentId) return { success: false, error: "To approve via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const result = await finJoeData.approveExpense(expenseId, contactStudentId);
      if (!result) return { success: false, error: `Could not approve expense #${expenseIdInput}. It may not be pending.` };
      if (result.submittedByContactPhone) {
        const submitterEmail = await getSubmitterEmail(result.submittedByContactPhone, tenantId);
        notifySubmitterForApprovalRejection(
          result.submittedByContactPhone,
          expenseId,
          "approved",
          tenantId,
          undefined,
          traceId,
          submitterEmail
        ).catch((err) => logger.error("Failed to notify submitter of approval", { traceId, expenseId, err: String(err) }));
      }
      return { success: true, data: { expenseId, approved: true } };
    }

    case "reject_expense": {
      if (execCtx.contactRole !== "finance" && execCtx.contactRole !== "admin") {
        return { success: false, error: "Only finance or admin can reject expenses." };
      }
      if (!contactStudentId) return { success: false, error: "To approve or reject via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const reason = String(args.reason ?? "Rejected via FinJoe");
      const result = await finJoeData.rejectExpense(expenseId, contactStudentId, reason);
      if (!result) return { success: false, error: `Could not reject expense #${expenseIdInput}. It may not be pending.` };
      if (result.submittedByContactPhone) {
        const submitterEmail = await getSubmitterEmail(result.submittedByContactPhone, tenantId);
        notifySubmitterForApprovalRejection(
          result.submittedByContactPhone,
          expenseId,
          "rejected",
          tenantId,
          reason,
          traceId,
          submitterEmail
        ).catch((err) => logger.error("Failed to notify submitter of rejection", { traceId, expenseId, err: String(err) }));
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
      const expenseIdInput = String(args.expenseId ?? "");
      const expenseId = await finJoeData.resolveExpenseId(expenseIdInput);
      if (!expenseId) return { success: false, error: `Expense #${expenseIdInput} not found.` };
      const payoutMethod = String(args.payoutMethod ?? "bank_transfer").trim() || "bank_transfer";
      const payoutRef = String(args.payoutRef ?? "marked via FinJoe WhatsApp").trim() || "marked via FinJoe WhatsApp";
      const result = await finJoeData.recordExpensePayout(expenseId, payoutMethod, payoutRef);
      if (!result) return { success: false, error: `Could not record payout for expense #${expenseIdInput}. It may not be approved.` };
      return { success: true, data: { expenseId, paid: true, payoutMethod, payoutRef } };
    }

    case "create_recurring_template": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can create recurring templates." };
      }
      if (validCategoryIds.length === 0) {
        return { success: false, error: "No expense categories configured. Ask admin to add categories in FinJoe Settings." };
      }
      const amountVal = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      const amount = amountVal ?? 0;
      if (amount <= 0) return { success: false, error: "Amount must be a positive number." };
      let categoryId = String(args.categoryId ?? "").trim();
      let campusId = args.campusId ? String(args.campusId) : null;
      if (campusId === "null" || campusId === "__corporate__" || campusId === "") campusId = null;
      if (categoryId && !validCategoryIds.includes(categoryId)) {
        const resolved = resolveCategoryFromMessage(categoryId, execCtx.categories);
        if (resolved) categoryId = resolved;
      }
      if (campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      const frequency = String(args.frequency ?? "monthly").toLowerCase() as "monthly" | "weekly" | "quarterly";
      if (!["monthly", "weekly", "quarterly"].includes(frequency)) {
        return { success: false, error: "Frequency must be monthly, weekly, or quarterly." };
      }
      const startDateRaw = String(args.startDate ?? new Date().toISOString().slice(0, 10));
      const startDate = parseDateToISO(startDateRaw);
      if (!startDate) {
        return { success: false, error: "startDate must be a valid date (YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY)." };
      }
      const endDateNorm = args.endDate ? parseDateToISO(String(args.endDate)) : null;
      const dayOfMonth = args.dayOfMonth != null ? Math.min(31, Math.max(1, Number(args.dayOfMonth))) : undefined;
      const dayOfWeek = args.dayOfWeek != null ? Math.min(6, Math.max(0, Number(args.dayOfWeek))) : undefined;
      const template = await finJoeData.createRecurringTemplate({
        tenantId,
        costCenterId: campusId,
        categoryId: categoryId || validCategoryIds[0] || "",
        amount,
        description: args.description ? String(args.description) : null,
        vendorName: args.vendorName ? String(args.vendorName) : null,
        gstin: args.gstin ? String(args.gstin) : null,
        taxType: args.taxType ? String(args.taxType) : null,
        invoiceNumber: args.invoiceNumber ? String(args.invoiceNumber) : null,
        voucherNumber: args.voucherNumber ? String(args.voucherNumber) : null,
        frequency,
        dayOfMonth,
        dayOfWeek,
        startDate,
        endDate: endDateNorm,
      });
      if (template && "error" in template) return { success: false, error: template.error };
      if (!template?.id) return { success: false, error: USER_FACING_ERROR };
      return { success: true, data: { templateId: template.id, amount, frequency, startDate } };
    }

    case "list_recurring_templates": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can list recurring templates." };
      }
      const isActive = args.isActive !== undefined ? Boolean(args.isActive) : undefined;
      const rows = await finJoeData.listRecurringTemplates({ isActive });
      return { success: true, data: { templates: rows } };
    }

    case "update_recurring_template": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can update recurring templates." };
      }
      const templateId = String(args.templateId ?? "");
      const updates: Record<string, unknown> = {};
      if (args.amount !== undefined) updates.amount = Math.round(Number(args.amount));
      if (args.description !== undefined) updates.description = args.description ? String(args.description) : null;
      if (args.vendorName !== undefined) updates.vendorName = args.vendorName ? String(args.vendorName) : null;
      if (args.gstin !== undefined) updates.gstin = args.gstin ? String(args.gstin) : null;
      if (args.taxType !== undefined) updates.taxType = args.taxType ? String(args.taxType) : null;
      if (args.invoiceNumber !== undefined) updates.invoiceNumber = args.invoiceNumber ? String(args.invoiceNumber) : null;
      if (args.voucherNumber !== undefined) updates.voucherNumber = args.voucherNumber ? String(args.voucherNumber) : null;
      if (args.frequency !== undefined) {
        const freq = String(args.frequency).toLowerCase();
        if (["monthly", "weekly", "quarterly"].includes(freq)) updates.frequency = freq;
      }
      if (args.dayOfMonth !== undefined) updates.dayOfMonth = Math.min(31, Math.max(1, Number(args.dayOfMonth)));
      if (args.dayOfWeek !== undefined) updates.dayOfWeek = Math.min(6, Math.max(0, Number(args.dayOfWeek)));
      if (args.endDate !== undefined) updates.endDate = args.endDate ? parseDateToISO(String(args.endDate)) ?? null : null;
      if (args.isActive !== undefined) updates.isActive = Boolean(args.isActive);
      if (Object.keys(updates).length === 0) return { success: false, error: "No fields to update. Specify at least one." };
      const result = await finJoeData.updateRecurringTemplate(templateId, updates as any);
      if (!result) return { success: false, error: `Could not update template #${templateId}. It may not exist.` };
      return { success: true, data: { templateId, updated: true } };
    }

    case "delete_recurring_template": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can delete recurring templates." };
      }
      const templateId = String(args.templateId ?? "");
      const deleted = await finJoeData.deleteRecurringTemplate(templateId);
      if (!deleted) return { success: false, error: `Could not delete template #${templateId}. It may not exist.` };
      return { success: true, data: { templateId, deleted: true } };
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
  tenantId: string,
  traceId?: string
) {
  const financeAndAdmin = await db
    .select()
    .from(finJoeContacts)
    .where(
      and(
        eq(finJoeContacts.tenantId, tenantId),
        eq(finJoeContacts.isActive, true),
        or(eq(finJoeContacts.role, "admin"), eq(finJoeContacts.role, "finance"))
      )
    );
  const msg = `Role change request #${requestId}: ${name} wants to become ${requestedRole}${campusName ? ` (Campus: ${campusName})` : ""}. Reply APPROVE ROLE ${requestId} or REJECT ROLE ${requestId} to act.`;
  for (const c of financeAndAdmin) {
    try {
      await sendWith24hRouting(c.phone, msg, null, traceId, tenantId, { critical: true });
    } catch (err) {
      logger.error("Failed to notify admin for role request", { traceId, phone: c.phone, err: String(err) });
    }
  }
}

/** Notify finance contacts about expense needing approval */
async function notifyFinanceForApproval(
  expenseId: string,
  extracted: ExtractedExpense,
  tenantId: string,
  traceId?: string,
  categoryName?: string | null
) {
  const financeContacts = await db
    .select()
    .from(finJoeContacts)
    .where(and(eq(finJoeContacts.tenantId, tenantId), eq(finJoeContacts.role, "finance"), eq(finJoeContacts.isActive, true)));
  const lineItem = extracted.description || categoryName || extracted.vendorName;
  const shortId = toShortExpenseId(expenseId);
  const msg = `New expense #${shortId} needs approval: ₹${extracted.amount?.toLocaleString("en-IN")}${lineItem ? ` - ${lineItem}` : ""}. Reply APPROVE ${shortId} or REJECT ${shortId} to act.`;
  const templateConfig = await getExpenseApprovalTemplateConfig(
    expenseId,
    extracted.amount ?? 0,
    tenantId,
    extracted.vendorName,
    extracted.description,
    categoryName
  );
  logger.info("Notifying finance for approval", { traceId, expenseId, count: financeContacts.length });
  for (const c of financeContacts) {
    try {
      await sendWith24hRouting(c.phone, msg, templateConfig, traceId, tenantId, { critical: true });
    } catch (err) {
      logger.error("Failed to notify finance", { traceId, phone: c.phone, err: String(err) });
    }
  }
}

/** Get submitter email from contact's linked user (if any) */
async function getSubmitterEmail(contactPhone: string, tenantId: string): Promise<string | null> {
  const phoneNorm = normalizePhone(contactPhone);
  const [contact] = await db
    .select({ studentId: finJoeContacts.studentId })
    .from(finJoeContacts)
    .where(and(eq(finJoeContacts.tenantId, tenantId), eq(finJoeContacts.phone, phoneNorm)))
    .limit(1);
  if (!contact?.studentId) return null;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, contact.studentId)).limit(1);
  return user?.email ?? null;
}
