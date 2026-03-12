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

/** Map field to friendly_name for status display */
const FIELD_TO_FRIENDLY_NAME: Record<keyof SyncedTemplates, string> = {
  expenseApprovalTemplateSid: "finjoe_expense_approval",
  expenseApprovedTemplateSid: "finjoe_expense_approved",
  expenseRejectedTemplateSid: "finjoe_expense_rejected",
  reEngagementTemplateSid: "finjoe_re_engagement",
};

export type SyncedTemplates = {
  expenseApprovalTemplateSid: string | null;
  expenseApprovedTemplateSid: string | null;
  expenseRejectedTemplateSid: string | null;
  reEngagementTemplateSid: string | null;
};

export type TemplateStatus = "approved" | "pending" | "rejected" | "paused" | "disabled" | "unsubmitted";

export type TemplateStatusEntry = {
  status: TemplateStatus;
  sid: string | null;
};

export type SyncResult = {
  synced: Partial<SyncedTemplates>;
  skipped: string[];
  templateStatuses?: Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>>;
};

function isWhatsAppApproved(approvalRequests: Record<string, unknown> | undefined): boolean {
  if (!approvalRequests || typeof approvalRequests !== "object") return false;
  const whatsapp = approvalRequests.whatsapp as Record<string, unknown> | undefined;
  if (!whatsapp || typeof whatsapp !== "object") return false;
  const status = String(whatsapp.status ?? "").toLowerCase();
  return status === "approved";
}

function getWhatsAppStatus(approvalRequests: Record<string, unknown> | undefined): TemplateStatus {
  if (!approvalRequests || typeof approvalRequests !== "object") return "unsubmitted";
  const whatsapp = approvalRequests.whatsapp as Record<string, unknown> | undefined;
  if (!whatsapp || typeof whatsapp !== "object") return "unsubmitted";
  const raw = String(whatsapp.status ?? "").toLowerCase();
  const valid: TemplateStatus[] = ["approved", "pending", "rejected", "paused", "disabled"];
  if (valid.includes(raw as TemplateStatus)) return raw as TemplateStatus;
  if (raw === "received") return "pending"; // Twilio uses "received" when just submitted
  return raw ? (raw as TemplateStatus) : "unsubmitted";
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

  const templateStatuses = buildTemplateStatuses(records);
  return { synced, skipped, templateStatuses };
}

/**
 * Fetch template statuses (approved, pending, rejected, etc.) for all FinJoe templates from Twilio.
 * Does not modify the database. Use for display-only status checks.
 */
export async function fetchTemplateStatusesFromTwilio(
  accountSid: string,
  authToken: string
): Promise<Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>>> {
  const client = twilio(accountSid, authToken);
  const records = await client.content.v1.contentAndApprovals.list({ limit: 2000, pageSize: 500 });
  return buildTemplateStatuses(records);
}

function buildTemplateStatuses(
  records: { friendlyName?: string | null; sid?: string | null; approvalRequests?: unknown }[]
): Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>> {
  const statuses: Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>> = {};
  for (const record of records) {
    const friendlyName = record.friendlyName ?? "";
    const field = FRIENDLY_NAME_TO_FIELD[friendlyName];
    if (!field) continue;
    const approvalRequests = record.approvalRequests as Record<string, unknown> | undefined;
    statuses[field] = {
      status: getWhatsAppStatus(approvalRequests),
      sid: record.sid ?? null,
    };
  }
  // Ensure all 4 fields have an entry (use unsubmitted for not found)
  for (const field of Object.keys(FIELD_TO_FRIENDLY_NAME) as (keyof SyncedTemplates)[]) {
    if (!statuses[field]) {
      statuses[field] = { status: "unsubmitted", sid: null };
    }
  }
  return statuses;
}
