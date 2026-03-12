#!/usr/bin/env node
/**
 * Update FinJoe templates via PUT: fetch SIDs from Twilio Content API by friendly_name,
 * fix content, resubmit for approval.
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * Optional: Load .env (node --env-file=.env)
 *
 * After running, use Sync from Twilio in Admin FinJoe Settings to update finjoe_settings
 * when templates are approved.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

for (const p of [join(rootDir, ".env"), join(rootDir, ".env.local")]) {
  if (existsSync(p)) {
    const env = readFileSync(p, "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
    break;
  }
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (!accountSid || !authToken) {
  console.error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

const templateDefs = {
  finjoe_expense_approval: {
    body: "Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.",
    variables: { "1": "EXP001", "2": "₹50,000 - Vendor Name" },
  },
  finjoe_expense_approved: {
    body: "Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.",
    variables: { "1": "EXP001" },
  },
  finjoe_expense_rejected: {
    body: "Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.",
    variables: { "1": "EXP001", "2": "Reason not provided" },
  },
  finjoe_re_engagement: {
    body: "Hello from FinJoe! We are here to help you with expense submissions, approvals, and any finance-related questions. Reply to this message to get started or ask for assistance.",
    variables: {},
  },
};

async function listContent() {
  const all = [];
  let url = "https://content.twilio.com/v1/Content?PageSize=500";
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`List failed: ${res.status} ${err}`);
    }
    const data = await res.json();
    const contents = data.contents ?? data;
    if (Array.isArray(contents)) all.push(...contents);
    else if (contents?.contents) all.push(...contents.contents);
    url = data.meta?.next_page_url ?? null;
  }
  return all;
}

async function updateTemplate(sid, body, variables) {
  const res = await fetch(`https://content.twilio.com/v1/Content/${sid}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      variables,
      types: { "twilio/text": { body } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function submitForApproval(sid, name) {
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
  return res.json();
}

async function main() {
  const contents = await listContent();
  const byName = {};
  for (const c of contents) {
    const name = c.friendly_name ?? c.friendlyName;
    if (name && name.startsWith("finjoe_")) byName[name] = c.sid;
  }

  for (const [name, def] of Object.entries(templateDefs)) {
    const sid = byName[name];
    if (!sid) {
      console.log(`Skipping ${name}: not found in Twilio. Create it with create-finjoe-templates.mjs`);
      continue;
    }
    try {
      await updateTemplate(sid, def.body, def.variables);
      console.log(`Updated ${name} (${sid})`);
      await submitForApproval(sid, name);
      console.log(`  Resubmitted for WhatsApp approval`);
    } catch (err) {
      console.error(`Error for ${name}:`, err.message);
    }
  }

  console.log("\nWhen templates are approved, use Sync from Twilio in Admin FinJoe Settings to update finjoe_settings.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
