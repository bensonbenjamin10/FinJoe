/**
 * Twilio Content API - create templates and submit for WhatsApp approval.
 */

import { FINJOE_TEMPLATE_DEFINITIONS } from "./finjoe-templates.js";

export type CreateResult = {
  created: Record<string, string>;
  errors: string[];
};

export type SubmitResult = {
  submitted: string[];
  alreadySubmitted: string[];
  errors: string[];
};

/** Map form field to Twilio friendly_name for submit */
export const FIELD_TO_FRIENDLY_NAME: Record<string, string> = {
  expenseApprovalTemplateSid: "finjoe_expense_approval",
  expenseApprovedTemplateSid: "finjoe_expense_approved",
  expenseRejectedTemplateSid: "finjoe_expense_rejected",
  reEngagementTemplateSid: "finjoe_re_engagement",
};

/** Map friendly_name to form field for create response */
const FRIENDLY_NAME_TO_FIELD: Record<string, string> = {
  finjoe_expense_approval: "expenseApprovalTemplateSid",
  finjoe_expense_approved: "expenseApprovedTemplateSid",
  finjoe_expense_rejected: "expenseRejectedTemplateSid",
  finjoe_re_engagement: "reEngagementTemplateSid",
};

/**
 * Create all FinJoe templates in Twilio (does NOT submit for approval).
 * Returns created SIDs and any errors. Partial success is possible.
 */
export async function createTemplatesInTwilio(
  accountSid: string,
  authToken: string
): Promise<CreateResult> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const created: Record<string, string> = {};
  const errors: string[] = [];

  for (const t of FINJOE_TEMPLATE_DEFINITIONS) {
    try {
      const sid = await createTemplate(auth, t);
      const field = FRIENDLY_NAME_TO_FIELD[t.friendlyName];
      if (field) created[field] = sid;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${t.friendlyName}: ${msg}`);
    }
  }

  return { created, errors };
}

/**
 * Submit templates for WhatsApp approval. SIDs must already exist in Twilio.
 * sids: map of form field -> Content SID (e.g. expenseApprovalTemplateSid -> HX...)
 */
/** Twilio error 92009: template already submitted for approval */
const TWILIO_ALREADY_SUBMITTED_CODE = 92009;

export async function submitTemplatesForApproval(
  accountSid: string,
  authToken: string,
  sids: Record<string, string>
): Promise<SubmitResult> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const submitted: string[] = [];
  const alreadySubmitted: string[] = [];
  const errors: string[] = [];

  for (const [field, sid] of Object.entries(sids)) {
    const name = FIELD_TO_FRIENDLY_NAME[field];
    if (!name || !sid?.trim()) continue;
    const result = await submitForApproval(auth, sid.trim(), name);
    if (result === "submitted") submitted.push(name);
    else if (result === "already_submitted") alreadySubmitted.push(name);
    else errors.push(`${name}: ${result}`);
  }

  return { submitted, alreadySubmitted, errors };
}

async function createTemplate(
  auth: string,
  t: (typeof FINJOE_TEMPLATE_DEFINITIONS)[0]
): Promise<string> {
  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      friendly_name: t.friendlyName,
      language: "en",
      variables: t.variables,
      types: { "twilio/text": { body: t.body } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { sid?: string };
  if (!data.sid) throw new Error("No SID in response");
  return data.sid;
}

/** Returns "submitted" | "already_submitted" | error message string */
async function submitForApproval(auth: string, sid: string, name: string): Promise<"submitted" | "already_submitted" | string> {
  const res = await fetch(
    `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ name, category: "UTILITY" }),
    }
  );
  if (res.ok) return "submitted";
  const errText = await res.text();
  if (res.status === 400) {
    try {
      const errJson = JSON.parse(errText) as { code?: number };
      if (errJson.code === TWILIO_ALREADY_SUBMITTED_CODE) return "already_submitted";
    } catch {
      /* ignore parse errors */
    }
  }
  return `Approval submit failed: ${res.status} ${errText}`;
}
