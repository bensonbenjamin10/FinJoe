import { sendFinJoeWhatsApp, sendFinJoeWhatsAppTemplate, sendFinJoeSms } from "./twilio.js";
import { sendFinJoeEmail } from "./email.js";
import { isWithin24hWindow } from "./window.js";
import { getOrCreateConversation } from "./conversation.js";
import { logger } from "./logger.js";
import { db } from "./db.js";
import { finJoeMessages } from "../../shared/schema.js";
import { createFinJoeData } from "../../lib/finjoe-data.js";
import { toShortExpenseId } from "../../lib/expense-id.js";
import { getPlatformSettings } from "./platform-settings.js";

export type FinJoeTemplateConfig = {
  templateSid: string;
  contentVariables: Record<string, string>;
};

export type SendWith24hOptions = {
  critical?: boolean;
  submitterEmail?: string | null;
};

type CachedSettings = {
  finjoeExpenseApprovalTemplateSid: string | null;
  finjoeExpenseApprovedTemplateSid: string | null;
  finjoeExpenseRejectedTemplateSid: string | null;
  finjoeReEngagementTemplateSid: string | null;
  notificationEmails: string[];
  resendFromEmail: string | null;
};

const settingsCache = new Map<string, CachedSettings>();

/** Invalidate per-tenant settings cache (call after finjoe_settings update). */
export function invalidateSendSettingsCache(tenantId?: string): void {
  if (tenantId) {
    settingsCache.delete(tenantId);
  } else {
    settingsCache.clear();
  }
}

async function fetchFinJoeSettings(tenantId: string): Promise<CachedSettings | null> {
  const cached = settingsCache.get(tenantId);
  if (cached) return cached;
  try {
    const finJoeData = createFinJoeData(db, tenantId);
    const settings = await finJoeData.getFinJoeSettings();
    const tenantEmails = (settings?.notificationEmails ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));
    const platform = await getPlatformSettings();
    const notificationEmails = tenantEmails.length > 0 ? tenantEmails : platform.defaultNotificationEmails;
    const result: CachedSettings = {
      finjoeExpenseApprovalTemplateSid: settings?.finjoeExpenseApprovalTemplateSid ?? null,
      finjoeExpenseApprovedTemplateSid: settings?.finjoeExpenseApprovedTemplateSid ?? null,
      finjoeExpenseRejectedTemplateSid: settings?.finjoeExpenseRejectedTemplateSid ?? null,
      finjoeReEngagementTemplateSid: settings?.finjoeReEngagementTemplateSid ?? null,
      notificationEmails,
      resendFromEmail: settings?.resendFromEmail ?? platform.defaultResendFromEmail ?? null,
    };
    settingsCache.set(tenantId, result);
    return result;
  } catch (err) {
    logger.error("Failed to fetch FinJoe settings", { tenantId, err: String(err) });
    return null;
  }
}

/** Store outbound message for audit and proof of transactions */
async function storeOutboundMessage(
  conversationId: string,
  body: string,
  messageSid?: string | null
): Promise<void> {
  try {
    await db.insert(finJoeMessages).values({
      conversationId,
      direction: "out",
      body,
      messageSid: messageSid ?? undefined,
    });
  } catch (err) {
    logger.warn("Failed to store outbound message", { conversationId, err: String(err) });
  }
}

/**
 * Send message with 24h window routing: free-form within 24h, template outside.
 * Outside 24h: try WhatsApp template, then SMS fallback.
 * Critical messages always also email notificationEmails (+ optional submitterEmail),
 * regardless of whether the messaging channel succeeded.
 * Stores all outbound messages for audit.
 */
export async function sendWith24hRouting(
  to: string,
  freeFormMessage: string,
  templateConfig: FinJoeTemplateConfig | null,
  traceId: string | undefined,
  tenantId: string,
  options?: SendWith24hOptions
): Promise<boolean> {
  const conversation = await getOrCreateConversation(to, tenantId);
  const within24h = await isWithin24hWindow(to, tenantId);

  let messagingDelivered = false;
  let messagingSid: string | null = null;

  if (within24h) {
    const result = await sendFinJoeWhatsApp(to, freeFormMessage, traceId, tenantId);
    if (result) {
      messagingSid = (result as { sid?: string })?.sid ?? null;
      messagingDelivered = true;
      await storeOutboundMessage(conversation.id, freeFormMessage, messagingSid);
    }
  } else {
    if (templateConfig?.templateSid) {
      try {
        const result = await sendFinJoeWhatsAppTemplate(
          to,
          templateConfig.templateSid,
          templateConfig.contentVariables,
          traceId,
          tenantId
        );
        if (result) {
          messagingSid = (result as { sid?: string })?.sid ?? null;
          messagingDelivered = true;
        }
      } catch (err) {
        logger.warn("WhatsApp template send failed, trying SMS fallback", { traceId, to, err: String(err) });
      }
    }

    if (!messagingDelivered) {
      try {
        const smsResult = await sendFinJoeSms(to, freeFormMessage, traceId, tenantId);
        if (smsResult) messagingDelivered = true;
      } catch (err) {
        logger.warn("SMS fallback failed", { traceId, to, err: String(err) });
      }
    }

    if (messagingDelivered) {
      await storeOutboundMessage(conversation.id, freeFormMessage, messagingSid);
    } else {
      logger.warn("Outside 24h window - no messaging channel delivered (template/SMS)", { traceId, to });
    }
  }

  // Critical emails always fire regardless of messaging channel outcome.
  // notificationEmails is the tenant/platform finance inbox; submitterEmail is a CC for the submitter.
  let emailDelivered = false;
  if (options?.critical) {
    const settings = await fetchFinJoeSettings(tenantId);
    const emails: string[] = [...(settings?.notificationEmails ?? [])];
    if (options.submitterEmail && options.submitterEmail.includes("@")) {
      emails.push(options.submitterEmail);
    }
    if (emails.length > 0) {
      const normalized = freeFormMessage.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
      const subject = normalized.length > 60 ? normalized.slice(0, 57) + "..." : normalized;
      const html = `<p>${freeFormMessage.replace(/\n/g, "<br>")}</p>`;
      emailDelivered = await sendFinJoeEmail(
        emails,
        `FinJoe: ${subject}`,
        html,
        { tenantId, idempotencyKey: traceId ? `finjoe-${traceId}` : undefined },
        traceId
      );
    }
  }

  return messagingDelivered || emailDelivered;
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
      "1": toShortExpenseId(expenseId),
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
    contentVariables: { "1": toShortExpenseId(expenseId) },
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
      "1": toShortExpenseId(expenseId),
      "2": reason || "Reason not provided",
    },
  };
}

/** Send re-engagement template when user messages after 24h+ silence. No-op if template not configured. */
export async function sendReEngagementIfNeeded(to: string, tenantId: string, traceId?: string): Promise<boolean> {
  const settings = await fetchFinJoeSettings(tenantId);
  const sid = settings?.finjoeReEngagementTemplateSid;
  if (!sid) return false;
  const conversation = await getOrCreateConversation(to, tenantId);
  try {
    const result = await sendFinJoeWhatsAppTemplate(to, sid, {}, traceId, tenantId);
    if (result) {
      await storeOutboundMessage(
        conversation.id,
        "[Re-engagement template]",
        (result as { sid?: string })?.sid ?? undefined
      );
    }
    return !!result;
  } catch (err) {
    logger.error("Re-engagement template send failed", { traceId, to, err: String(err) });
    return false;
  }
}

export type ExpenseNotificationContext = {
  amount?: number | null;
  vendorName?: string | null;
  categoryName?: string | null;
  costCenterName?: string | null;
};

/** Notify submitter when expense is approved or rejected (24h routing: free-form vs template, SMS fallback, email if available) */
export async function notifySubmitterForApprovalRejection(
  to: string,
  expenseId: string,
  type: "approved" | "rejected",
  tenantId: string,
  reason?: string,
  traceId?: string,
  submitterEmail?: string | null,
  expenseContext?: ExpenseNotificationContext
): Promise<boolean> {
  const shortId = toShortExpenseId(expenseId);

  if (type === "approved") {
    const parts: string[] = [`Good news! Your expense #${shortId} has been approved.`];
    if (expenseContext?.amount) parts.push(`Amount: ₹${expenseContext.amount.toLocaleString("en-IN")}`);
    if (expenseContext?.categoryName) parts.push(`Category: ${expenseContext.categoryName}`);
    if (expenseContext?.vendorName) parts.push(`Vendor: ${expenseContext.vendorName}`);
    if (expenseContext?.costCenterName) parts.push(`Cost Center: ${expenseContext.costCenterName}`);
    const freeForm = parts.join("\n");
    const templateConfig = await getExpenseApprovedTemplateConfig(expenseId, tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId, {
      critical: true,
      submitterEmail,
    });
  } else {
    const parts: string[] = [`Your expense #${shortId} has been rejected.`];
    if (expenseContext?.amount) parts.push(`Amount: ₹${expenseContext.amount.toLocaleString("en-IN")}`);
    if (expenseContext?.categoryName) parts.push(`Category: ${expenseContext.categoryName}`);
    if (expenseContext?.vendorName) parts.push(`Vendor: ${expenseContext.vendorName}`);
    if (expenseContext?.costCenterName) parts.push(`Cost Center: ${expenseContext.costCenterName}`);
    parts.push(`Reason: ${reason || "Not provided"}`);
    const freeForm = parts.join("\n");
    const templateConfig = await getExpenseRejectedTemplateConfig(expenseId, reason || "", tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId, {
      critical: true,
      submitterEmail,
    });
  }
}
