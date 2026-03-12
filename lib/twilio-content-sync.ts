/**
 * Twilio Content API sync - fetch approved templates and map to finjoe_settings fields.
 */

import twilio from "twilio";

/** Map friendly_name to finjoe_settings field */
const FRIENDLY_NAME_TO_FIELD: Record<string, keyof SyncedTemplates> = {
  finjoe_expense_approval: "expenseApprovalTemplateSid",
  finjoe_expense_approved: "expenseApprovedTemplateSid",
  finjoe_expense_rejected: "expenseRejectedTemplateSid",
  finjoe_re_engagement: "reEngagementTemplateSid",
};

export type SyncedTemplates = {
  expenseApprovalTemplateSid: string | null;
  expenseApprovedTemplateSid: string | null;
  expenseRejectedTemplateSid: string | null;
  reEngagementTemplateSid: string | null;
};

export type SyncResult = {
  synced: Partial<SyncedTemplates>;
  skipped: string[];
};

function isWhatsAppApproved(approvalRequests: Record<string, unknown> | undefined): boolean {
  if (!approvalRequests || typeof approvalRequests !== "object") return false;
  const whatsapp = approvalRequests.whatsapp as Record<string, unknown> | undefined;
  if (!whatsapp || typeof whatsapp !== "object") return false;
  const status = String(whatsapp.status ?? "").toLowerCase();
  return status === "approved";
}

/**
 * Fetch ContentAndApprovals from Twilio, filter for approved WhatsApp templates,
 * and map friendly_name to finjoe_settings fields.
 */
export async function fetchApprovedTemplatesFromTwilio(
  accountSid: string,
  authToken: string
): Promise<SyncResult> {
  const client = twilio(accountSid, authToken);
  const records = await client.content.v1.contentAndApprovals.list({ limit: 2000, pageSize: 500 });

  const synced: Partial<SyncedTemplates> = {};
  const skipped: string[] = [];

  for (const record of records) {
    const friendlyName = record.friendlyName ?? "";
    const field = FRIENDLY_NAME_TO_FIELD[friendlyName];
    if (!field) continue;

    const approvalRequests = record.approvalRequests as Record<string, unknown> | undefined;
    if (!isWhatsAppApproved(approvalRequests)) {
      const status = (approvalRequests?.whatsapp as Record<string, unknown>)?.status ?? "unsubmitted";
      skipped.push(`${friendlyName} (${String(status)})`);
      continue;
    }

    if (record.sid) {
      synced[field] = record.sid;
    }
  }

  return { synced, skipped };
}
