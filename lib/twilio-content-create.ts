/**
 * Twilio Content API - create templates and submit for WhatsApp approval.
 */

import { FINJOE_TEMPLATE_DEFINITIONS } from "./finjoe-templates.js";

export type CreateResult = {
  created: Record<string, string>;
  errors: string[];
};

/**
 * Create all FinJoe templates in Twilio and submit each for WhatsApp approval.
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
      await submitForApproval(auth, sid, t.friendlyName);
      created[t.friendlyName] = sid;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${t.friendlyName}: ${msg}`);
    }
  }

  return { created, errors };
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

async function submitForApproval(auth: string, sid: string, name: string): Promise<void> {
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Approval submit failed: ${res.status} ${err}`);
  }
}
