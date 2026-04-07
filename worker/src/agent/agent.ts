import { db, pool } from "../db.js";
import {
  finJoeContacts,
  finJoeMedia,
  finJoeTasks,
  finJoeMessages,
  finJoeConversations,
  finJoeRoleChangeRequests,
  users,
  expenses,
  costCenters,
  expenseCategories,
  tenants,
} from "../../../shared/schema.js";
import { eq, and, desc, or } from "drizzle-orm";
import { sendWith24hRouting, getExpenseApprovalTemplateConfig, notifySubmitterForApprovalRejection } from "../send.js";
import { notifySubmitterForPayoutFromExpense, notifyRoleRequestRequester } from "../../../lib/notifications.js";
import { logger } from "../logger.js";
import {
  agentTurn,
  agentTurnWithFunctionResponse,
  extractExpenseOrExpensesFromImage,
  transcribeAudio,
  parseAmount,
  type ExtractedExpense,
  type ConversationTurn,
} from "./gemini.js";
import { parseExpensesFromCsv } from "../csv-parser.js";
import { fetchSystemContext, fetchSystemData, resolveCategoryFromMessage, resolveCampusFromMessage, resolveIncomeCategoryFromMessage, type DataCollectionSettings } from "../context.js";
import { validateExpenseData, validateRoleChangeData } from "../validation.js";
import { createFinJoeData } from "../../../lib/finjoe-data.js";
import {
  extractPayoutRefFromMessage,
  isValidExpensePayoutMethod,
  VALID_EXPENSE_PAYOUT_METHODS,
} from "../../../shared/payout-methods.js";
import { toShortExpenseId } from "../../../lib/expense-id.js";
import { getMedia } from "../../../lib/media-storage.js";
import { parseExpenseQuery, parseDateToISO } from "../../../lib/expense-query-ai.js";
import { embedQuery } from "../../../lib/expense-embeddings.js";
import { parseExpenseTaxFields } from "../../../lib/expense-tax-fields.js";
import { normalizePhone } from "../twilio.js";
import { getPredictions } from "../../../server/analytics.js";

const HISTORY_LIMIT = 10;

const USER_FACING_ERROR = "I couldn't save that right now. Please try again in a moment, or contact support if it persists.";

/** Merge prior pending expense/income fields with new tool args so partial follow-up messages only fill gaps. */
function shallowMergeRecord(
  prior: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): Record<string, unknown> {
  return { ...(prior ?? {}), ...args };
}

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

async function getConversationContext(conversationId: string): Promise<ConversationContext & { contextExpired?: boolean }> {
  const [conv] = await db
    .select({ context: finJoeConversations.context, lastMessageAt: finJoeConversations.lastMessageAt })
    .from(finJoeConversations)
    .where(eq(finJoeConversations.id, conversationId))
    .limit(1);
  const raw = (conv?.context as ConversationContext) ?? {};
  if (!conv?.lastMessageAt) return raw;
  const ageMs = Date.now() - new Date(conv.lastMessageAt).getTime();
  if (ageMs > CONTEXT_EXPIRY_HOURS * 60 * 60 * 1000) {
    const hadPending = !!(raw.pendingExpense || raw.pendingRoleChange || raw.pendingConfirmation);
    const { pendingExpense, pendingRoleChange, pendingConfirmation, ...rest } = raw;
    return { ...rest, contextExpired: hadPending };
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

  const { context: systemContextBase, costCenterLabel, dataCollectionSettings } = await fetchSystemContext(tenantId);
  const [tenantRow] = await db.select({ isDemo: tenants.isDemo }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const systemContext =
    tenantRow?.isDemo === true
      ? `${systemContextBase}\n\n[ DEMO MODE — ACME sandbox: The user is exploring FinJoe with rich sample data (multi-branch, GST, petty cash). Act as an enthusiastic product tutor. On greetings like "Hello", "Hi", or "Hello, Finjoe", welcome them and suggest 3 quick tries: (1) ask about expenses or revenue for a branch, (2) send a receipt photo to simulate capture, (3) mention they can open the web dashboard to review approvals. Stay concise.]`
      : systemContextBase;
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
  const isAudio = (ct: string | null) =>
    ct?.startsWith("audio/") ?? false;
  const hasMedia = media.some((m) => isCsv(m.contentType) || isImageOrPdf(m.contentType));
  const hasAudio = media.some((m) => isAudio(m.contentType));

  let audioTranscript: string | null = null;

  if (hasAudio) {
    const firstAudio = media.find((m) => isAudio(m.contentType));
    const audioBuffer = firstAudio?.data ?? (firstAudio?.storagePath ? await getMedia(firstAudio.storagePath) : null);
    if (audioBuffer) {
      logger.info("Transcribing audio message", { ...ctx, contentType: firstAudio!.contentType, sizeBytes: audioBuffer.length });
      const base64 = audioBuffer.toString("base64");
      audioTranscript = await transcribeAudio(base64, firstAudio!.contentType, traceId);
      if (audioTranscript) {
        logger.info("Audio transcription succeeded", { ...ctx, transcriptLength: audioTranscript.length });
      } else {
        logger.info("Audio transcription returned empty", { ...ctx });
      }
    }
  }

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
      const imageTextContext = [messageBody, audioTranscript].filter(Boolean).join(" ") || undefined;
      const extractionResult = await extractExpenseOrExpensesFromImage(
        base64,
        firstImage!.contentType,
        imageTextContext,
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
  let effectiveUserMessage = body;
  if (audioTranscript) {
    effectiveUserMessage = effectiveUserMessage
      ? `${effectiveUserMessage}\n[Voice message transcription: "${audioTranscript}"]`
      : audioTranscript;
  }
  if (!effectiveUserMessage && hasAudio && !audioTranscript) {
    effectiveUserMessage = "[Voice message received but could not be transcribed. Please ask the user to type their message or try again.]";
  }
  effectiveUserMessage = (effectiveUserMessage || (hasMedia ? "[Image or file attached - please process the expense data]" : "")).trim();
  if ((convContext as { contextExpired?: boolean }).contextExpired) {
    effectiveUserMessage = `[SYSTEM NOTE: The user's previous in-progress expense/request has expired due to inactivity (over 24 hours). Let them know their previous data was cleared and they'll need to start fresh if they were mid-flow.]\n${effectiveUserMessage}`;
  }

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
          contactName,
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
          userMessage: effectiveUserMessage,
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
  contactName?: string | null;
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
  /** Latest user message text (for extracting UTR/reference when the model omits payoutRef). */
  userMessage?: string;
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
      const d = pending.data as Record<string, unknown> & {
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
      const confirmTax = parseExpenseTaxFields(d);
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
          baseAmount: confirmTax.baseAmount ?? null,
          taxAmount: confirmTax.taxAmount ?? null,
          taxRate: confirmTax.taxRate ?? null,
          submittedByContactPhone: contactPhone,
        });
      } catch (err) {
        logger.error("Confirm expense create error", { traceId, err: String(err) });
      }
      if (!expense?.id) return { success: false, error: USER_FACING_ERROR };
      await finJoeData.submitExpense(expense.id, contactStudentId);
      const categoryName = execCtx.categories.find((c) => c.id === d.categoryId)?.name ?? null;
      const costCenterName = d.campusId ? (execCtx.campuses.find((c) => c.id === d.campusId)?.name ?? null) : "Corporate Office";
      await notifyFinanceForApproval(expense.id, { amount: d.amount, vendorName: d.vendorName ?? undefined, invoiceNumber: d.invoiceNumber ?? undefined, invoiceDate: d.invoiceDate ?? undefined, description: d.description ?? undefined, gstin: d.gstin ?? undefined, taxType: d.taxType ?? undefined }, tenantId, traceId, categoryName, execCtx.contactName, costCenterName);
      return { success: true, data: { expenseId: expense.id, amount: d.amount, vendorName: d.vendorName, categoryName, costCenterName } };
    }

    case "confirm_income": {
      const pending = convContext.pendingConfirmation;
      if (!pending || pending.type !== "income") {
        return { success: false, error: "Nothing to confirm. Please provide the income details again." };
      }
      const d = pending.data as { amount: number; categoryId: string; campusId: string | null; particulars?: string | null; incomeDate: string };
      let income: { id: string } | null = null;
      try {
        income = await finJoeData.createIncome({
          tenantId,
          costCenterId: d.campusId,
          categoryId: d.categoryId,
          amount: d.amount,
          incomeDate: d.incomeDate,
          particulars: d.particulars ?? null,
          submittedByContactPhone: contactPhone,
          recordedById: execCtx.contactStudentId,
        });
      } catch (err) {
        logger.error("Confirm income create error", { traceId, err: String(err) });
        return { success: false, error: USER_FACING_ERROR };
      }
      const incomeCategoryName = execCtx.incomeCategories.find((c) => c.id === d.categoryId)?.name ?? null;
      return { success: true, data: { incomeId: income?.id, amount: d.amount, categoryName: incomeCategoryName, incomeDate: d.incomeDate } };
    }

    case "create_expense": {
      if (validCategoryIds.length === 0) {
        logger.warn("Agent category validation failed", {
          channel: "whatsapp_agent",
          categoryValidation: "EXPENSE_NO_CATEGORIES",
          tenantId,
          traceId,
          expenseCategoryCount: 0,
          incomeCategoryCount: execCtx.validIncomeCategoryIds.length,
        });
        return {
          success: false,
          error:
            "No expense categories configured for this workspace. Ask admin to add categories in FinJoe Settings (Expenses).",
        };
      }
      const priorConfirm =
        convContext.pendingConfirmation?.type === "expense"
          ? (convContext.pendingConfirmation.data as Record<string, unknown>)
          : undefined;
      const mergedArgs = shallowMergeRecord(priorConfirm, args);
      const amountVal = typeof mergedArgs.amount === "number" ? Math.round(mergedArgs.amount) : parseAmount(mergedArgs.amount);
      const amount = amountVal ?? 0;
      let categoryId = String(mergedArgs.categoryId ?? "");
      let campusId = mergedArgs.campusId ? String(mergedArgs.campusId) : null;
      if (categoryId && !validCategoryIds.includes(categoryId)) {
        const resolved = resolveCategoryFromMessage(categoryId, execCtx.categories);
        categoryId = resolved ?? "";
      }
      if (campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      if (!categoryId) {
        if (validCategoryIds.length === 1) {
          categoryId = validCategoryIds[0];
        } else {
          const names = execCtx.categories.map((c) => c.name).join(", ");
          logger.warn("Agent category validation failed", {
            channel: "whatsapp_agent",
            categoryValidation: "EXPENSE_CATEGORY_REQUIRED",
            tenantId,
            traceId,
            expenseCategoryCount: validCategoryIds.length,
            categoryIdArgPresent: Boolean(String(mergedArgs.categoryId ?? "").trim()),
          });
          return {
            success: false,
            error: `Expense — category required (multiple categories in this workspace). Ask the user which applies. Available: ${names}. If none fit, suggest an admin create a new category.`,
          };
        }
      }
      const today = new Date().toISOString().slice(0, 10);
      const parsedInvoiceDate = mergedArgs.invoiceDate ? parseDateToISO(String(mergedArgs.invoiceDate)) : null;
      const taxFromArgs = parseExpenseTaxFields(mergedArgs as Record<string, unknown>);
      const expenseData = {
        amount: amount ?? 0,
        expenseDate: parseDateToISO(String(mergedArgs.invoiceDate ?? today)) ?? today,
        categoryId,
        campusId,
        description: mergedArgs.description ? String(mergedArgs.description) : null,
        invoiceNumber: mergedArgs.invoiceNumber ? String(mergedArgs.invoiceNumber) : null,
        invoiceDate: parsedInvoiceDate ?? (mergedArgs.invoiceDate ? today : null),
        vendorName: mergedArgs.vendorName ? String(mergedArgs.vendorName) : null,
        gstin: mergedArgs.gstin ? String(mergedArgs.gstin) : null,
        taxType: mergedArgs.taxType ? String(mergedArgs.taxType) : null,
        ...taxFromArgs,
      };

      const validation = validateExpenseData(expenseData, execCtx.categories, execCtx.campuses, requireAuditAbove);
      if (!validation.valid) {
        return { success: false, error: `I need: ${validation.errors.join(". ")}. Please provide the missing information.` };
      }

      const duplicate = await finJoeData.findLikelyDuplicateExpense({
        amount: expenseData.amount,
        expenseDate: expenseData.expenseDate,
        categoryId: expenseData.categoryId,
        costCenterId: expenseData.campusId,
        invoiceNumber: expenseData.invoiceNumber,
        submittedByContactPhone: contactPhone,
      });
      if (duplicate) {
        const canPatch = duplicate.status === "draft";
        return {
          success: true,
          data: {
            duplicateDetected: true,
            matchReason: duplicate.reason,
            existingExpenseId: duplicate.shortId,
            existingStatus: duplicate.status,
            existingAmount: duplicate.amount,
            existingVendor: duplicate.vendorName,
            existingInvoiceNumber: duplicate.invoiceNumber,
            canMergeWithUpdateExpense: canPatch,
            instruction: canPatch
              ? `Do NOT call create_expense again. This matches expense #${duplicate.shortId} (draft). If the user is only adding or correcting fields (invoice number, GSTIN, description, etc.), call update_expense with expenseId "${duplicate.shortId}" and pass ONLY the fields that changed or were missing. If they insist this is a different purchase, ask them to confirm explicitly, then you may call create_expense.`
              : `Do NOT call create_expense again. This matches expense #${duplicate.shortId} (status: ${duplicate.status}). It cannot be edited via WhatsApp unless it is in draft. Tell the user the duplicate risk and that they should use the dashboard or ask finance if a correction is needed.`,
          },
        };
      }

      // Require confirmation before posting: store/update pending and ask user to confirm (handles user corrections too)
      if (requireConfirmation) {
        const campusName = campusId ? execCtx.campuses.find((c) => c.id === campusId)?.name ?? campusId : "Corporate Office";
        const confirmCategoryName = expenseData.categoryId ? (execCtx.categories.find((c) => c.id === expenseData.categoryId)?.name ?? null) : null;
        const summaryParts = [`₹${expenseData.amount.toLocaleString("en-IN")}`];
        if (confirmCategoryName) summaryParts.push(`Category: ${confirmCategoryName}`);
        if (expenseData.vendorName) summaryParts.push(`Vendor: ${expenseData.vendorName}`);
        summaryParts.push(`Cost Center: ${campusName}`);
        if (expenseData.description && expenseData.description !== confirmCategoryName) summaryParts.push(`Note: ${expenseData.description}`);
        if (expenseData.expenseDate) summaryParts.push(`Date: ${expenseData.expenseDate}`);
        if (expenseData.invoiceNumber) summaryParts.push(`Invoice: ${expenseData.invoiceNumber}`);
        const summary = summaryParts.join(", ");
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
        ...taxFromArgs,
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
          baseAmount: taxFromArgs.baseAmount ?? null,
          taxAmount: taxFromArgs.taxAmount ?? null,
          taxRate: taxFromArgs.taxRate ?? null,
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
      const costCenterName2 = expenseData.campusId ? (execCtx.campuses.find((c) => c.id === expenseData.campusId)?.name ?? null) : "Corporate Office";
      await notifyFinanceForApproval(expense.id, extracted, tenantId, traceId, categoryName, execCtx.contactName, costCenterName2);

      return { success: true, data: { expenseId: expense.id, extracted } };
    }

    case "create_income": {
      const { validIncomeCategoryIds, incomeCategories: incCats } = execCtx;
      if (validIncomeCategoryIds.length === 0) {
        logger.warn("Agent category validation failed", {
          channel: "whatsapp_agent",
          categoryValidation: "INCOME_NO_CATEGORIES",
          tenantId,
          traceId,
          incomeCategoryCount: 0,
          expenseCategoryCount: validCategoryIds.length,
        });
        return {
          success: false,
          error:
            "No income categories configured for this workspace. Ask admin to add income categories in the web app (Income settings).",
        };
      }
      const priorIncomeConfirm =
        convContext.pendingConfirmation?.type === "income"
          ? (convContext.pendingConfirmation.data as Record<string, unknown>)
          : undefined;
      const mergedIncomeArgs = shallowMergeRecord(priorIncomeConfirm, args);
      const amountVal = typeof mergedIncomeArgs.amount === "number" ? Math.round(mergedIncomeArgs.amount) : parseAmount(mergedIncomeArgs.amount);
      const amount = amountVal ?? 0;
      if (amount <= 0) {
        return { success: false, error: "Income amount must be a positive number." };
      }
      let categoryId = String(mergedIncomeArgs.categoryId ?? "").trim();
      let campusId = mergedIncomeArgs.campusId ? String(mergedIncomeArgs.campusId) : null;
      if (categoryId && !validIncomeCategoryIds.includes(categoryId)) {
        const resolved = resolveIncomeCategoryFromMessage(categoryId, incCats);
        categoryId = resolved ?? "";
      }
      if (campusId && !execCtx.validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      let finalCategoryId = categoryId;
      if (!finalCategoryId) {
        if (validIncomeCategoryIds.length === 1) {
          finalCategoryId = validIncomeCategoryIds[0];
        } else {
          const names = incCats.map((c) => c.name).join(", ");
          logger.warn("Agent category validation failed", {
            channel: "whatsapp_agent",
            categoryValidation: "INCOME_CATEGORY_REQUIRED",
            tenantId,
            traceId,
            incomeCategoryCount: validIncomeCategoryIds.length,
            categoryIdArgPresent: Boolean(String(mergedIncomeArgs.categoryId ?? "").trim()),
          });
          return {
            success: false,
            error: `Income — category required (multiple income categories in this workspace). Ask the user which applies. Available: ${names}. If none fit, suggest an admin create a new income category.`,
          };
        }
      }
      const today = new Date().toISOString().slice(0, 10);
      const incomeDate = parseDateToISO(String(mergedIncomeArgs.incomeDate ?? today)) ?? today;
      const particulars = mergedIncomeArgs.particulars ? String(mergedIncomeArgs.particulars) : null;

      const incomeData = {
        amount,
        categoryId: finalCategoryId,
        campusId,
        particulars: particulars ?? null,
        incomeDate,
        recordedById: execCtx.contactStudentId,
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
          incomeType: mergedIncomeArgs.incomeType ? String(mergedIncomeArgs.incomeType) : "other",
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
        logger.warn("Agent category validation failed", {
          channel: "whatsapp_agent",
          categoryValidation: "BULK_EXPENSE_NO_CATEGORIES",
          tenantId,
          traceId,
          expenseCategoryCount: 0,
          incomeCategoryCount: execCtx.validIncomeCategoryIds.length,
        });
        return {
          success: false,
          error:
            "No expense categories configured for this workspace. Ask admin to add categories in FinJoe Settings (Expenses).",
        };
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
      const defaultCategoryId = validCategoryIds.length === 1 ? validCategoryIds[0] : "";
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
      const bulkSkippedDuplicates: Array<{ row: number; existingExpenseId: string; matchReason: string }> = [];

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
          categoryId = resolved ?? "";
        }
        if (campusId && !validCampusIds.includes(campusId)) {
          const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
          if (resolved) campusId = resolved;
        }
        if (!categoryId) {
          const names = execCtx.categories.map((c) => c.name).join(", ");
          return { success: false, error: `Expense ${i + 1}: category is required. Please ask which category to use. Available: ${names}.` };
        }
        const rawDate = String(r.invoiceDate ?? r.expenseDate ?? today);
        const expenseDate = parseDateToISO(rawDate) ?? today;
        const rowTax = parseExpenseTaxFields(r);
        const expenseData = {
          amount,
          expenseDate,
          categoryId,
          campusId,
          description: (r.description ?? r.particulars) ? String(r.description ?? r.particulars) : null,
          invoiceNumber: null as string | null,
          invoiceDate: r.invoiceDate ? (parseDateToISO(String(r.invoiceDate)) ?? today) : null,
          vendorName: (r.vendorName ?? r.name) ? String(r.vendorName ?? r.name) : null,
          gstin: r.gstin != null && String(r.gstin).trim() !== "" ? String(r.gstin) : null,
          taxType: r.taxType != null && String(r.taxType).trim() !== "" ? String(r.taxType) : null,
          ...rowTax,
        };
        const validation = validateExpenseData(expenseData, execCtx.categories, execCtx.campuses, requireAuditAbove);
        if (!validation.valid) {
          return { success: false, error: `Expense ${i + 1}: ${validation.errors.join(". ")}` };
        }
        const rowDup = await finJoeData.findLikelyDuplicateExpense({
          amount: expenseData.amount,
          expenseDate: expenseData.expenseDate,
          categoryId: expenseData.categoryId,
          costCenterId: expenseData.campusId,
          invoiceNumber: expenseData.invoiceNumber,
          submittedByContactPhone: contactPhone,
        });
        if (rowDup) {
          bulkSkippedDuplicates.push({
            row: i + 1,
            existingExpenseId: rowDup.shortId,
            matchReason: rowDup.reason,
          });
          continue;
        }
        const extracted: ExtractedExpense = {
          amount: expenseData.amount,
          vendorName: expenseData.vendorName ?? undefined,
          description: expenseData.description ?? undefined,
          invoiceDate: expenseData.invoiceDate ?? undefined,
          gstin: expenseData.gstin ?? undefined,
          taxType: expenseData.taxType ?? undefined,
          ...rowTax,
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
            gstin: item.extracted.gstin != null ? String(item.extracted.gstin) : null,
            taxType: item.extracted.taxType != null ? String(item.extracted.taxType) : null,
            baseAmount: item.extracted.baseAmount ?? null,
            taxAmount: item.extracted.taxAmount ?? null,
            taxRate: item.extracted.taxRate ?? null,
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
            const bulkCostCenterName = item.campusId ? (execCtx.campuses.find((c) => c.id === item.campusId)?.name ?? null) : "Corporate Office";
            await notifyFinanceForApproval(expense.id, item.extracted, tenantId, traceId, categoryName, execCtx.contactName, bulkCostCenterName);
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
      return {
        success: true,
        data: {
          created: expenseIds.length,
          expenseIds,
          skippedDuplicates: bulkSkippedDuplicates.length ? bulkSkippedDuplicates : undefined,
        },
      };
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
      const validation = validateRoleChangeData(roleData, execCtx.campuses);
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
      const priorPending = convContext.pendingExpense?.extracted as Record<string, unknown> | undefined;
      const mergedPendingArgs = shallowMergeRecord(priorPending, args);
      const amountVal =
        typeof mergedPendingArgs.amount === "number" ? Math.round(mergedPendingArgs.amount) : parseAmount(mergedPendingArgs.amount);
      const missingFields = Array.isArray(mergedPendingArgs.missingFields)
        ? mergedPendingArgs.missingFields.map(String)
        : [];
      let pendingCategoryId = mergedPendingArgs.categoryId ? String(mergedPendingArgs.categoryId) : undefined;
      if (pendingCategoryId && !validCategoryIds.includes(pendingCategoryId)) {
        const resolved = resolveCategoryFromMessage(pendingCategoryId, execCtx.categories);
        pendingCategoryId = resolved ?? undefined;
      }
      let pendingCampusId: string | null | undefined = mergedPendingArgs.campusId ? String(mergedPendingArgs.campusId) : undefined;
      if (pendingCampusId && !validCampusIds.includes(pendingCampusId)) {
        const resolved = resolveCampusFromMessage(pendingCampusId, execCtx.campuses);
        pendingCampusId = resolved ?? undefined;
      }
      const extracted: ExtractedExpense & { categoryId?: string; campusId?: string | null } = {
        amount: amountVal ?? undefined,
        vendorName: mergedPendingArgs.vendorName ? String(mergedPendingArgs.vendorName) : undefined,
        invoiceNumber: mergedPendingArgs.invoiceNumber ? String(mergedPendingArgs.invoiceNumber) : undefined,
        invoiceDate: mergedPendingArgs.invoiceDate ? String(mergedPendingArgs.invoiceDate) : undefined,
        description: mergedPendingArgs.description ? String(mergedPendingArgs.description) : undefined,
        gstin: mergedPendingArgs.gstin ? String(mergedPendingArgs.gstin) : undefined,
        taxType: mergedPendingArgs.taxType ? String(mergedPendingArgs.taxType) : undefined,
        categoryId: pendingCategoryId,
        campusId: pendingCampusId !== undefined ? pendingCampusId : undefined,
        ...parseExpenseTaxFields(mergedPendingArgs as Record<string, unknown>),
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

    case "list_incomes": {
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 100) : undefined;
      const rows = await finJoeData.listIncomes({ limit });
      return { success: true, data: { incomes: rows } };
    }

    case "list_bank_transactions": {
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 100) : undefined;
      const status = args.status ? String(args.status) : undefined;
      const rows = await finJoeData.listBankTransactions({ status, limit });
      return { success: true, data: { bankTransactions: rows } };
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
      const [expDetail] = await db
        .select({
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          description: expenses.description,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          costCenterId: expenses.costCenterId,
          categoryId: expenses.categoryId,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(eq(expenses.id, expenseId))
        .limit(1);
      if (expDetail) {
        const submitCostCenterName = expDetail.costCenterName ?? "Corporate Office";
        notifyFinanceForApproval(
          expenseId,
          { amount: expDetail.amount ?? undefined, vendorName: expDetail.vendorName ?? undefined, description: expDetail.description ?? undefined },
          tenantId, traceId, expDetail.categoryName, execCtx.contactName, submitCostCenterName
        ).catch((err) => logger.error("Failed to notify finance after submit_expense", { traceId, expenseId, err: String(err) }));
      }
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
        if (resolved) {
          categoryId = resolved;
        } else {
          const names = execCtx.categories.map((c) => c.name).join(", ");
          return { success: false, error: `Invalid category. Please ask the user to choose from: ${names}. If none fit, suggest contacting an admin to create a new category.` };
        }
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
        baseAmount?: number | null;
        taxAmount?: number | null;
        taxRate?: number | null;
      } = {};
      const amt = typeof args.amount === "number" ? Math.round(args.amount) : parseAmount(args.amount);
      if (amt !== undefined) updates.amount = amt;
      if (args.vendorName !== undefined) updates.vendorName = args.vendorName ? String(args.vendorName) : null;
      if (args.invoiceNumber !== undefined) updates.invoiceNumber = args.invoiceNumber ? String(args.invoiceNumber) : null;
      const today = new Date().toISOString().slice(0, 10);
      if (args.invoiceDate !== undefined) updates.invoiceDate = args.invoiceDate ? (parseDateToISO(String(args.invoiceDate)) ?? today) : null;
      if (args.expenseDate !== undefined) updates.expenseDate = parseDateToISO(String(args.expenseDate)) ?? today;
      if (args.description !== undefined) updates.description = args.description ? String(args.description) : null;
      if (categoryId) updates.categoryId = categoryId;
      if (campusId !== undefined) updates.costCenterId = campusId;
      if (args.gstin !== undefined) updates.gstin = args.gstin ? String(args.gstin) : null;
      if (args.taxType !== undefined) updates.taxType = args.taxType ? String(args.taxType) : null;
      if (args.baseAmount !== undefined) {
        updates.baseAmount =
          args.baseAmount === null ? null : parseExpenseTaxFields({ baseAmount: args.baseAmount }).baseAmount ?? null;
      }
      if (args.taxAmount !== undefined) {
        updates.taxAmount =
          args.taxAmount === null ? null : parseExpenseTaxFields({ taxAmount: args.taxAmount }).taxAmount ?? null;
      }
      if (args.taxRate !== undefined) {
        updates.taxRate = args.taxRate === null ? null : parseExpenseTaxFields({ taxRate: args.taxRate }).taxRate ?? null;
      }
      if (Object.keys(updates).length === 0) {
        return {
          success: false,
          error:
            "No fields to update. Specify at least one: amount, vendorName, invoiceNumber, invoiceDate, description, categoryId, campusId, gstin, taxType, baseAmount, taxAmount, taxRate.",
        };
      }
      const validationData = { ...updates, categoryId: updates.categoryId, campusId: updates.costCenterId };
      if (validationData.categoryId && !validCategoryIds.includes(validationData.categoryId)) {
        const names = execCtx.categories.map((c) => c.name).join(", ");
        return { success: false, error: `Invalid category. Valid options: ${names}` };
      }
      if (validationData.campusId && validationData.campusId !== "__corporate__" && validCampusIds.length > 0 && !validCampusIds.includes(validationData.campusId)) {
        const names = execCtx.campuses.map((c) => c.name).join(", ");
        return { success: false, error: `Invalid cost center. Valid options: ${names}` };
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
      const searchQuery = parsed?.searchQuery ?? question;
      const startDate = parsed?.startDate; // Already normalized by parseExpenseQuery (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
      const endDate = parsed?.endDate;
      let campusId = parsed?.campusId ?? undefined;
      if (campusId && !execCtx.validCampusIds.includes(campusId)) {
        campusId = resolveCampusFromMessage(campusId, execCtx.campuses) ?? campusId;
      }
      if (execCtx.contactRole === "campus_coordinator") {
        if (!execCtx.contactCampusId) {
          return {
            success: true,
            data: {
              message: "You can only access your assigned cost center data, but your contact is not mapped to a cost center yet. Please ask an admin to map your contact.",
              expenses: [],
              summary: null,
            },
          };
        }
        if (campusId && campusId !== execCtx.contactCampusId) {
          return {
            success: true,
            data: {
              message: "Access denied. You can only view expenses for your assigned cost center.",
              expenses: [],
              summary: null,
              parsedQuery: { searchQuery, startDate, endDate, campusId: execCtx.contactCampusId },
            },
          };
        }
      }
      if (!campusId && execCtx.contactRole === "campus_coordinator" && execCtx.contactCampusId) {
        campusId = execCtx.contactCampusId;
      }
      const categoryId =
        parsed?.categoryHint
          ? (resolveCategoryFromMessage(parsed.categoryHint, execCtx.categories) ?? undefined)
          : undefined;
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
        searchResults = await finJoeData.searchExpenses(searchQuery, 20, {
          startDate,
          endDate,
          campusId: campusId ?? null,
          categoryId,
        });
      }
      let expenses = searchResults.slice(0, 20);
      if (expenses.length === 0) {
        expenses = await finJoeData.listExpenses({
          startDate,
          endDate,
          campusId: campusId ?? null,
          categoryId,
          limit: 20,
        });
      }
      let summary = null;
      if (startDate && endDate) {
        summary = await finJoeData.getExpenseSummary({ startDate, endDate, campusId: campusId ?? undefined, categoryId });
      }
      return {
        success: true,
        data: {
          expenses,
          summary,
          parsedQuery: { searchQuery, startDate, endDate, campusId, categoryId },
          ...(parsed ? {} : { message: "I used a broader semantic match because I couldn't fully parse the date/cost center filters." }),
        },
      };
    }

    case "search_expenses": {
      const query = String(args.query ?? "").trim();
      if (!query) return { success: false, error: "Search query is required." };
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 20;
      const campusId = execCtx.contactRole === "campus_coordinator" ? execCtx.contactCampusId : undefined;
      if (execCtx.contactRole === "campus_coordinator") {
        if (!execCtx.contactCampusId) {
          return {
            success: true,
            data: {
              message: "You can only access your assigned cost center data, but your contact is not mapped to a cost center yet. Please ask an admin to map your contact.",
              expenses: [],
            },
          };
        }
        const requestedCampusFromQuery = resolveCampusFromMessage(query, execCtx.campuses);
        if (requestedCampusFromQuery && requestedCampusFromQuery !== execCtx.contactCampusId) {
          return {
            success: true,
            data: {
              message: "Access denied. You can only view expenses for your assigned cost center.",
              expenses: [],
            },
          };
        }
      }
      const rows = await finJoeData.searchExpenses(query, limit, { campusId });
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

    case "predict_cash_requirement": {
      const parsed = typeof args.horizonDays === "number" ? Math.round(args.horizonDays) : 7;
      const horizonDays = Math.min(90, Math.max(1, isNaN(parsed) ? 7 : parsed));
      const prediction = await getPredictions({
        tenantId,
        horizonDays,
      });
      const p = prediction as Record<string, unknown>;
      const driverFactors = Array.isArray(p.driverFactors) ? (p.driverFactors as string[]) : [];
      const alerts = Array.isArray(p.alerts) ? (p.alerts as Array<{ message?: string }>) : [];
      const forecastRange = (p.forecastRange as { min?: number; max?: number } | undefined) ?? {};
      const explanationParts: string[] = [];
      if (driverFactors.length) explanationParts.push(`Key drivers: ${driverFactors.slice(0, 3).join("; ")}`);
      if (typeof forecastRange.min === "number" && typeof forecastRange.max === "number") {
        explanationParts.push(
          `Range: ₹${Math.round(forecastRange.min).toLocaleString("en-IN")} to ₹${Math.round(forecastRange.max).toLocaleString("en-IN")}`
        );
      }
      if (alerts.length) {
        const alertText = alerts
          .slice(0, 2)
          .map((a) => a?.message)
          .filter(Boolean)
          .join(" | ");
        if (alertText) explanationParts.push(`Alerts: ${alertText}`);
      }
      return {
        success: true,
        data: {
          horizonDays,
          cashRequiredNextWeek: p.cashRequiredNextWeek ?? 0,
          cashRequiredHorizon: p.cashRequiredHorizon ?? 0,
          forecastRange: p.forecastRange ?? null,
          confidence: p.confidence ?? "medium",
          driverFactors,
          alerts: p.alerts ?? [],
          cashflowForecast: p.cashflowForecast ?? [],
          engine: p.engine ?? "unknown",
          model: p.model ?? "unknown",
          accuracyTelemetry: p.accuracyTelemetry ?? null,
          explanation: explanationParts.join(". "),
        },
      };
    }

    case "finance_vendor_concentration": {
      const startDate = String(args.startDate ?? "");
      const endDate = String(args.endDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return { success: false, error: "startDate and endDate must be YYYY-MM-DD." };
      }
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const data = await finJoeData.getFinanceVendorConcentration({ startDate, endDate, campusId });
      return { success: true, data };
    }

    case "finance_approval_backlog": {
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const data = await finJoeData.getFinanceApprovalBacklog({ campusId });
      return { success: true, data };
    }

    case "finance_variance_bridge": {
      const startDate = String(args.startDate ?? "");
      const endDate = String(args.endDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return { success: false, error: "startDate and endDate must be YYYY-MM-DD." };
      }
      const campusId = args.campusId ? String(args.campusId) : undefined;
      const data = await finJoeData.getFinanceVarianceBridge({ startDate, endDate, campusId });
      return { success: true, data };
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
      const expenseCtx = { amount: result.amount, vendorName: result.vendorName, categoryName: result.categoryName, costCenterName: result.costCenterName };
      if (result.submittedByContactPhone) {
        const submitterEmail = await getSubmitterEmail(result.submittedByContactPhone, tenantId);
        notifySubmitterForApprovalRejection(
          result.submittedByContactPhone,
          expenseId,
          "approved",
          tenantId,
          undefined,
          traceId,
          submitterEmail,
          expenseCtx
        ).catch((err) => logger.error("Failed to notify submitter of approval", { traceId, expenseId, err: String(err) }));
      }
      return { success: true, data: { expenseId, approved: true, amount: result.amount, vendorName: result.vendorName, categoryName: result.categoryName, costCenterName: result.costCenterName } };
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
      const rejectExpenseCtx = { amount: result.amount, vendorName: result.vendorName, categoryName: result.categoryName, costCenterName: result.costCenterName };
      if (result.submittedByContactPhone) {
        const submitterEmail = await getSubmitterEmail(result.submittedByContactPhone, tenantId);
        notifySubmitterForApprovalRejection(
          result.submittedByContactPhone,
          expenseId,
          "rejected",
          tenantId,
          reason,
          traceId,
          submitterEmail,
          rejectExpenseCtx
        ).catch((err) => logger.error("Failed to notify submitter of rejection", { traceId, expenseId, err: String(err) }));
      }
      return { success: true, data: { expenseId, rejected: true, reason, amount: result.amount, vendorName: result.vendorName, categoryName: result.categoryName, costCenterName: result.costCenterName } };
    }

    case "approve_role_request": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can approve role requests." };
      }
      if (!contactStudentId) return { success: false, error: "To approve role requests via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const requestId = String(args.requestId ?? "");
      const [reqRow] = await db
        .select({
          contactPhone: finJoeRoleChangeRequests.contactPhone,
          tenantId: finJoeRoleChangeRequests.tenantId,
          requestedRole: finJoeRoleChangeRequests.requestedRole,
          costCenterId: finJoeRoleChangeRequests.costCenterId,
          studentId: finJoeRoleChangeRequests.studentId,
        })
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, requestId))
        .limit(1);
      const result = await finJoeData.approveRoleRequest(requestId, contactStudentId);
      if (!result) return { success: false, error: `Could not approve role request #${requestId}. It may not be pending.` };
      if (reqRow?.tenantId) {
        const roleCampusName = reqRow.costCenterId ? (execCtx.campuses.find((c) => c.id === reqRow.costCenterId)?.name ?? null) : null;
        try {
          let requesterEmail: string | null = null;
          if (reqRow.studentId) {
            const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, reqRow.studentId)).limit(1);
            requesterEmail = u?.email ?? null;
          }
          await notifyRoleRequestRequester(reqRow.contactPhone, "approved", requestId, reqRow.tenantId, undefined, traceId, reqRow.requestedRole, roleCampusName, requesterEmail);
        } catch (notifyErr) {
          logger.error("Failed to notify role request requester of approval", { traceId, requestId, err: String(notifyErr) });
        }
      }
      return { success: true, data: { requestId, approved: true } };
    }

    case "reject_role_request": {
      if (execCtx.contactRole !== "admin" && execCtx.contactRole !== "finance") {
        return { success: false, error: "Only admin or finance can reject role requests." };
      }
      if (!contactStudentId) return { success: false, error: "To approve or reject role requests via WhatsApp, your contact must be linked to a user. Ask an admin to add you in FinJoe Contacts—they can link to your existing account or create one for you." };
      const requestId = String(args.requestId ?? "");
      const reason = String(args.reason ?? "Rejected via FinJoe");
      const [reqRow] = await db
        .select({
          contactPhone: finJoeRoleChangeRequests.contactPhone,
          tenantId: finJoeRoleChangeRequests.tenantId,
          requestedRole: finJoeRoleChangeRequests.requestedRole,
          costCenterId: finJoeRoleChangeRequests.costCenterId,
          studentId: finJoeRoleChangeRequests.studentId,
        })
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, requestId))
        .limit(1);
      const result = await finJoeData.rejectRoleRequest(requestId, contactStudentId, reason);
      if (!result) return { success: false, error: `Could not reject role request #${requestId}. It may not be pending.` };
      if (reqRow?.tenantId) {
        const roleCampusName = reqRow.costCenterId ? (execCtx.campuses.find((c) => c.id === reqRow.costCenterId)?.name ?? null) : null;
        try {
          let requesterEmail: string | null = null;
          if (reqRow.studentId) {
            const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, reqRow.studentId)).limit(1);
            requesterEmail = u?.email ?? null;
          }
          await notifyRoleRequestRequester(reqRow.contactPhone, "rejected", requestId, reqRow.tenantId, reason, traceId, reqRow.requestedRole, roleCampusName, requesterEmail);
        } catch (notifyErr) {
          logger.error("Failed to notify role request requester of rejection", { traceId, requestId, err: String(notifyErr) });
        }
      }
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
      const payoutMethodRaw = String(args.payoutMethod ?? "bank_transfer").trim() || "bank_transfer";
      if (!isValidExpensePayoutMethod(payoutMethodRaw)) {
        return {
          success: false,
          error: `Invalid payout method "${payoutMethodRaw}". Valid options: ${VALID_EXPENSE_PAYOUT_METHODS.join(", ")}`,
        };
      }
      let payoutRef = String(args.payoutRef ?? "").trim();
      const generic =
        !payoutRef ||
        payoutRef.toLowerCase() === "marked via finjoe whatsapp" ||
        payoutRef === "marked via WhatsApp";
      if (generic && execCtx.userMessage) {
        const extracted = extractPayoutRefFromMessage(execCtx.userMessage);
        if (extracted) payoutRef = extracted;
      }
      if (!payoutRef) payoutRef = "marked via FinJoe WhatsApp";
      const result = await finJoeData.recordExpensePayout(expenseId, payoutMethodRaw, payoutRef);
      if (!result) return { success: false, error: `Could not record payout for expense #${expenseIdInput}. It may not be approved.` };
      const payoutCtx = {
        amount: result.amount,
        vendorName: result.vendorName,
        costCenterName: result.costCenterName,
        payoutMethod: result.actualPayoutMethod,
        payoutRef,
      };
      try {
        await notifySubmitterForPayoutFromExpense(expenseId, tenantId, traceId, payoutCtx);
      } catch (notifyErr) {
        logger.error("Failed to notify submitter of payout", { traceId, expenseId, err: String(notifyErr) });
      }
      return {
        success: true,
        data: {
          expenseId,
          paid: true,
          payoutMethod: payoutMethodRaw,
          payoutRef,
          amount: result.amount,
          vendorName: result.vendorName,
          categoryName: result.categoryName,
          costCenterName: result.costCenterName,
        },
      };
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
        categoryId = resolved ?? "";
      }
      if (campusId && !validCampusIds.includes(campusId)) {
        const resolved = resolveCampusFromMessage(campusId, execCtx.campuses);
        if (resolved) campusId = resolved;
      }
      if (!categoryId) {
        if (validCategoryIds.length === 1) {
          categoryId = validCategoryIds[0];
        } else {
          const names = execCtx.categories.map((c) => c.name).join(", ");
          return { success: false, error: `Category is required for recurring template. Please ask the user which category to use. Available categories: ${names}.` };
        }
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
        categoryId,
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
        createdById: contactStudentId,
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
      updates.updatedById = contactStudentId;
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

/** Notify finance and admin contacts about expense needing approval */
async function notifyFinanceForApproval(
  expenseId: string,
  extracted: ExtractedExpense,
  tenantId: string,
  traceId?: string,
  categoryName?: string | null,
  submitterName?: string | null,
  costCenterName?: string | null
) {
  const financeAndAdmin = await db
    .select()
    .from(finJoeContacts)
    .where(
      and(
        eq(finJoeContacts.tenantId, tenantId),
        eq(finJoeContacts.isActive, true),
        or(eq(finJoeContacts.role, "finance"), eq(finJoeContacts.role, "admin"))
      )
    );
  const shortId = toShortExpenseId(expenseId);
  const amount = `₹${extracted.amount?.toLocaleString("en-IN")}`;
  const parts: string[] = [`New expense #${shortId} needs approval: *${amount}*`];
  if (categoryName) parts.push(`Category: ${categoryName}`);
  if (extracted.vendorName) parts.push(`Vendor: ${extracted.vendorName}`);
  if (extracted.description && extracted.description !== categoryName) parts.push(`Note: ${extracted.description}`);
  if (costCenterName) parts.push(`Cost Center: ${costCenterName}`);
  if (submitterName) parts.push(`Submitted by: ${submitterName}`);
  parts.push(`Reply APPROVE ${shortId} or REJECT ${shortId} to act.`);
  const msg = parts.join("\n");
  const templateConfig = await getExpenseApprovalTemplateConfig(
    expenseId,
    extracted.amount ?? 0,
    tenantId,
    extracted.vendorName,
    extracted.description,
    categoryName
  );
  if (financeAndAdmin.length === 0) {
    logger.warn("No finance/admin contacts for tenant - skipping approval notification", { traceId, tenantId, expenseId });
    return;
  }
  logger.info("Notifying finance/admin for approval", { traceId, expenseId, count: financeAndAdmin.length });
  for (const c of financeAndAdmin) {
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
