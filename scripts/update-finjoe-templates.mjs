#!/usr/bin/env node
/**
 * Update rejected FinJoe templates via PUT, fix content, resubmit.
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
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

const updates = [
  {
    sid: "HX958e56e3bb46afb9bd4283bbd99feba4",
    name: "finjoe_expense_approval",
    body: "Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.",
    variables: { "1": "EXP001", "2": "₹50,000 - Vendor Name" },
  },
  {
    sid: "HX99a42ff09fc387f35f7e51b4ed1b9fff",
    name: "finjoe_expense_approved",
    body: "Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.",
    variables: { "1": "EXP001" },
  },
  {
    sid: "HXd374a54337d010fcf254d49a0169e5c4",
    name: "finjoe_expense_rejected",
    body: "Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.",
    variables: { "1": "EXP001", "2": "Reason not provided" },
  },
  {
    sid: "HX271d1de51f9a1c03b97f3db1e74dacc8",
    name: "finjoe_re_engagement",
    body: "Hello from FinJoe! We are here to help you with expense submissions, approvals, and any finance-related questions. Reply to this message to get started or ask for assistance.",
    variables: {},
  },
];

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
  for (const u of updates) {
    try {
      await updateTemplate(u.sid, u.body, u.variables);
      console.log(`Updated ${u.name} (${u.sid})`);
      await submitForApproval(u.sid, u.name);
      console.log(`  Resubmitted for WhatsApp approval`);
    } catch (err) {
      console.error(`Error for ${u.name}:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
