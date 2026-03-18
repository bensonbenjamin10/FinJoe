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

/** Extract status from record - check approvalRequests and approvals (API may use either) */
function getStatusFromRecord(record: Record<string, unknown>): TemplateStatus {
  const approvalRequests = (record.approvalRequests ?? record.approval_requests) as Record<string, unknown> | undefined;
  const status = getWhatsAppStatus(approvalRequests);
  if (status !== "unsubmitted") return status;
  const approvals = (record.approvals ?? record.approval_content) as Record<string, unknown> | undefined;
  return getWhatsAppStatus(approvals as Record<string, unknown> | undefined);
}

/** Fetch approval status directly from Twilio ApprovalRequests endpoint (source of truth) */
async function fetchApprovalStatusForContent(
  accountSid: string,
  authToken: string,
  contentSid: string
): Promise<TemplateStatus> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return "unsubmitted";
  const data = (await res.json()) as { whatsapp?: { status?: string } };
  const raw = String(data?.whatsapp?.status ?? "").toLowerCase();
  const valid: TemplateStatus[] = ["approved", "pending", "rejected", "paused", "disabled"];
  if (valid.includes(raw as TemplateStatus)) return raw as TemplateStatus;
  if (raw === "received") return "pending";
  return raw ? (raw as TemplateStatus) : "unsubmitted";
}

/**
 * Fetch ContentAndApprovals from Twilio, filter for approved WhatsApp templates,
 * and map friendly_name to finjoe_settings fields.
 * Handles duplicates (same friendly_name, multiple SIDs): prefers approved over unsubmitted.
 * Falls back to per-template ApprovalRequests fetch when contentAndApprovals lacks status.
 */
export async function fetchApprovedTemplatesFromTwilio(
  accountSid: string,
  authToken: string
): Promise<SyncResult> {
  const client = twilio(accountSid, authToken);
  const records = await client.content.v1.contentAndApprovals.list({ limit: 2000, pageSize: 500 });

  // Collect candidates per field: { sid, status }[] (handles duplicates)
  const candidates = new Map<keyof SyncedTemplates, { sid: string; status: TemplateStatus }[]>();

  for (const record of records) {
    const friendlyName = record.friendlyName ?? "";
    const field = FRIENDLY_NAME_TO_FIELD[friendlyName];
    if (!field || !record.sid) continue;

    let status = getStatusFromRecord(record as unknown as Record<string, unknown>);
    if (status === "unsubmitted") {
      status = await fetchApprovalStatusForContent(accountSid, authToken, record.sid);
    }

    const list = candidates.get(field) ?? [];
    list.push({ sid: record.sid, status });
    candidates.set(field, list);
  }

  const synced: Partial<SyncedTemplates> = {};
  const skipped: string[] = [];

  for (const [field, list] of candidates) {
    const friendlyName = FIELD_TO_FRIENDLY_NAME[field];
    const approved = list.find((c) => c.status === "approved");
    const best = approved ?? list[list.length - 1];
    if (best.status === "approved") {
      synced[field] = best.sid;
    } else {
      skipped.push(`${friendlyName} (${best.status})`);
    }
  }

  const templateStatuses = buildTemplateStatusesFromCandidates(candidates);
  return { synced, skipped, templateStatuses };
}

function buildTemplateStatusesFromCandidates(
  candidates: Map<keyof SyncedTemplates, { sid: string; status: TemplateStatus }[]>
): Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>> {
  const statuses: Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>> = {};
  for (const field of Object.keys(FIELD_TO_FRIENDLY_NAME) as (keyof SyncedTemplates)[]) {
    const list = candidates.get(field);
    if (!list?.length) {
      statuses[field] = { status: "unsubmitted", sid: null };
      continue;
    }
    const approved = list.find((c) => c.status === "approved");
    const best = approved ?? list[list.length - 1];
    statuses[field] = { status: best.status, sid: best.sid };
  }
  return statuses;
}

/**
 * Fetch template statuses (approved, pending, rejected, etc.) for all FinJoe templates from Twilio.
 * Does not modify the database. Use for display-only status checks.
 * Falls back to per-template ApprovalRequests fetch when contentAndApprovals lacks status.
 */
export async function fetchTemplateStatusesFromTwilio(
  accountSid: string,
  authToken: string
): Promise<Partial<Record<keyof SyncedTemplates, TemplateStatusEntry>>> {
  const client = twilio(accountSid, authToken);
  const records = await client.content.v1.contentAndApprovals.list({ limit: 2000, pageSize: 500 });

  const candidates = new Map<keyof SyncedTemplates, { sid: string; status: TemplateStatus }[]>();

  for (const record of records) {
    const friendlyName = record.friendlyName ?? "";
    const field = FRIENDLY_NAME_TO_FIELD[friendlyName];
    if (!field || !record.sid) continue;

    let status = getStatusFromRecord(record as unknown as Record<string, unknown>);
    if (status === "unsubmitted") {
      status = await fetchApprovalStatusForContent(accountSid, authToken, record.sid);
    }

    const list = candidates.get(field) ?? [];
    list.push({ sid: record.sid, status });
    candidates.set(field, list);
  }

  return buildTemplateStatusesFromCandidates(candidates);
}
