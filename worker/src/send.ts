import { sendFinJoeWhatsApp, sendFinJoeWhatsAppTemplate, sendFinJoeSms } from "./twilio.js";
import { sendFinJoeEmail } from "./email.js";
import { isWithin24hWindow } from "./window.js";
import { getOrCreateConversation } from "./conversation.js";
import { logger } from "./logger.js";
import { db } from "./db.js";
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

/**
 * Send message with 24h window routing: free-form within 24h, template outside.
 * Outside 24h: try WhatsApp template, then SMS fallback, then email for critical.
 * Success = any channel delivers.
 */
export async function sendWith24hRouting(
  to: string,
  freeFormMessage: string,
  templateConfig: FinJoeTemplateConfig | null,
  traceId: string | undefined,
  tenantId: string,
  options?: SendWith24hOptions
): Promise<boolean> {
  const within24h = await isWithin24hWindow(to, tenantId);
  if (within24h) {
    const result = await sendFinJoeWhatsApp(to, freeFormMessage, traceId, tenantId);
    if (result) await getOrCreateConversation(to, tenantId);
    if (result) return true;
  }

  let delivered = false;

  if (!within24h) {
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
          await getOrCreateConversation(to, tenantId);
          delivered = true;
        }
      } catch (err) {
        logger.warn("WhatsApp template send failed, trying SMS fallback", { traceId, to, err: String(err) });
      }
    }

    if (!delivered) {
      try {
        const smsResult = await sendFinJoeSms(to, freeFormMessage, traceId, tenantId);
        if (smsResult) delivered = true;
      } catch (err) {
        logger.warn("SMS fallback failed", { traceId, to, err: String(err) });
      }
    }
  }

  if (options?.critical) {
    const settings = await fetchFinJoeSettings(tenantId);
    const emails: string[] = [...(settings?.notificationEmails ?? [])];
    if (options.submitterEmail && options.submitterEmail.includes("@")) {
      emails.push(options.submitterEmail);
    }
    if (emails.length > 0) {
      const subject = freeFormMessage.length > 60 ? freeFormMessage.slice(0, 57) + "..." : freeFormMessage;
      const html = `<p>${freeFormMessage.replace(/\n/g, "<br>")}</p>`;
      const emailSent = await sendFinJoeEmail(
        emails,
        `FinJoe: ${subject}`,
        html,
        { tenantId, idempotencyKey: traceId ? `finjoe-${traceId}` : undefined },
        traceId
      );
      if (emailSent) delivered = true;
    }
  }

  if (!delivered && !within24h) {
    logger.warn("Outside 24h window - no channel delivered (template/SMS/email)", { traceId, to });
  }
  return delivered;
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
  try {
    const result = await sendFinJoeWhatsAppTemplate(to, sid, {}, traceId, tenantId);
    if (result) await getOrCreateConversation(to, tenantId);
    return !!result;
  } catch (err) {
    logger.error("Re-engagement template send failed", { traceId, to, err: String(err) });
    return false;
  }
}

/** Notify submitter when expense is approved or rejected (24h routing: free-form vs template, SMS fallback, email if available) */
export async function notifySubmitterForApprovalRejection(
  to: string,
  expenseId: string,
  type: "approved" | "rejected",
  tenantId: string,
  reason?: string,
  traceId?: string,
  submitterEmail?: string | null
): Promise<boolean> {
  if (type === "approved") {
    const freeForm = `Good news! Your expense #${toShortExpenseId(expenseId)} has been approved.`;
    const templateConfig = await getExpenseApprovedTemplateConfig(expenseId, tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId, {
      critical: true,
      submitterEmail,
    });
  } else {
    const freeForm = `Your expense #${toShortExpenseId(expenseId)} has been rejected. Reason: ${reason || "Not provided"}`;
    const templateConfig = await getExpenseRejectedTemplateConfig(expenseId, reason || "", tenantId);
    return sendWith24hRouting(to, freeForm, templateConfig, traceId, tenantId, {
      critical: true,
      submitterEmail,
    });
  }
}
