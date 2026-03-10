import { sendFinJoeWhatsApp, sendFinJoeWhatsAppTemplate } from "./twilio.js";
import { isWithin24hWindow } from "./window.js";
import { getOrCreateConversation } from "./conversation.js";
import { logger } from "./logger.js";
import { db } from "./db.js";
import { createFinJoeData } from "../../lib/finjoe-data.js";

export type FinJoeTemplateConfig = {
  templateSid: string;
  contentVariables: Record<string, string>;
};

const settingsCache = new Map<string, { finjoeExpenseApprovalTemplateSid: string | null; finjoeExpenseApprovedTemplateSid: string | null; finjoeExpenseRejectedTemplateSid: string | null; finjoeReEngagementTemplateSid: string | null }>();

async function fetchFinJoeSettings(tenantId: string) {
  const cached = settingsCache.get(tenantId);
  if (cached) return cached;
  try {
    const finJoeData = createFinJoeData(db, tenantId);
    const settings = await finJoeData.getFinJoeSettings();
    const result = {
      finjoeExpenseApprovalTemplateSid: settings?.finjoeExpenseApprovalTemplateSid ?? null,
      finjoeExpenseApprovedTemplateSid: settings?.finjoeExpenseApprovedTemplateSid ?? null,
      finjoeExpenseRejectedTemplateSid: settings?.finjoeExpenseRejectedTemplateSid ?? null,
      finjoeReEngagementTemplateSid: settings?.finjoeReEngagementTemplateSid ?? null,
    };
    settingsCache.set(tenantId, result);
    return result;
  } catch (err) {
    logger.error("Failed to fetch FinJoe settings", { tenantId, err: String(err) });
    return null;
  }
}

/**
 * Send message with 24h window routing: free-form within 24h, template outside.
 * For proactive messages (e.g. notifyFinanceForApproval), pass templateConfig.
 * If outside 24h and no templateConfig/templateSid, the message is skipped.
 */
export async function sendWith24hRouting(
  to: string,
  freeFormMessage: string,
  templateConfig: FinJoeTemplateConfig | null,
  traceId: string | undefined,
  tenantId: string
): Promise<boolean> {
  const within24h = await isWithin24hWindow(to, tenantId);
  if (within24h) {
    const result = await sendFinJoeWhatsApp(to, freeFormMessage, traceId, tenantId);
    if (result) await getOrCreateConversation(to, tenantId);
    return !!result;
  }
  if (templateConfig?.templateSid) {
    const result = await sendFinJoeWhatsAppTemplate(
      to,
      templateConfig.templateSid,
      templateConfig.contentVariables,
      traceId,
      tenantId
    );
    if (result) await getOrCreateConversation(to, tenantId);
    return !!result;
  }
  logger.warn("Outside 24h window and no template configured - skipping send", { traceId, to });
  return false;
}

/** Build expense approval template config from settings and expense data */
export async function getExpenseApprovalTemplateConfig(
  expenseId: string,
  amount: number,
  tenantId: string,
  vendorName?: string | null,
  description?: string | null,
  categoryName?: string | null
): Promise<FinJoeTemplateConfig | null> {
  const settings = await fetchFinJoeSettings(tenantId);
  const sid = settings?.finjoeExpenseApprovalTemplateSid;
  if (!sid) return null;
  const lineItem = description || categoryName || vendorName;
  const amountStr = `₹${amount.toLocaleString("en-IN")}${lineItem ? ` - ${lineItem}` : ""}`;
  return {
    templateSid: sid,
    contentVariables: {
      "1": expenseId,
      "2": amountStr,
    },
  };
}

/** Build expense approved template config for submitter notification */
export async function getExpenseApprovedTemplateConfig(expenseId: string, tenantId: string): Promise<FinJoeTemplateConfig | null> {
  const settings = await fetchFinJoeSettings(tenantId);
  const sid = settings?.finjoeExpenseApprovedTemplateSid;
  if (!sid) return null;
  return {
    templateSid: sid,
    contentVariables: { "1": expenseId },
  };
}

/** Build expense rejected template config for submitter notification */
export async function getExpenseRejectedTemplateConfig(expenseId: string, reason: string, tenantId: string): Promise<FinJoeTemplateConfig | null> {
  const settings = await fetchFinJoeSettings(tenantId);
  const sid = settings?.finjoeExpenseRejectedTemplateSid;
  if (!sid) return null;
  return {
    templateSid: sid,
    contentVariables: {
      "1": expenseId,
      "2": reason || "Reason not provided",
    },
  };
}

/** Send re-engagement template when user messages after 24h+ silence. No-op if template not configured. */
export async function sendReEngagementIfNeeded(to: string, tenantId: string, traceId?: string): Promise<boolean> {
  const settings = await fetchFinJoeSettings(tenantId);
  const sid = settings?.finjoeReEngagementTemplateSid;
  if (!sid) return false;
  try {
    const result = await sendFinJoeWhatsAppTemplate(to, sid, {}, traceId, tenantId);
    if (result) await getOrCreateConversation(to, tenantId);
    return !!result;
  } catch (err) {
    logger.error("Re-engagement template send failed", { traceId, to, err: String(err) });
    return false;
  }
}

/** Notify submitter when expense is approved or rejected (24h routing: free-form vs template) */
export async function notifySubmitterForApprovalRejection(
  to: string,
  expenseId: string,
  type: "approved" | "rejected",
  tenantId: string,
  reason?: string,
  traceId?: string
): Promise<boolean> {
  if (type === "approved") {
    const freeForm = `Good news! Your expense #${expenseId} has been approved.`;
    const templateConfig = await getExpenseApprovedTemplateConfig(expenseId, tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId);
  } else {
    const freeForm = `Your expense #${expenseId} has been rejected. Reason: ${reason || "Not provided"}`;
    const templateConfig = await getExpenseRejectedTemplateConfig(expenseId, reason || "", tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId);
  }
}
