#!/usr/bin/env node
/**
 * Create FinJoe WhatsApp Content Templates via Twilio Content API,
 * submit for approval, and update finjoe_settings in the database.
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DATABASE_URL
 * Optional: Load .env (node --env-file=.env)
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Pool } from "@neondatabase/serverless";

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
const databaseUrl = process.env.DATABASE_URL;

if (!accountSid || !authToken) {
  console.error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

const templates = [
  {
    friendly_name: "finjoe_expense_approval",
    approval_name: "finjoe_expense_approval",
    body: "Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.",
    variables: { "1": "EXP001", "2": "₹50,000 - Vendor Name" },
  },
  {
    friendly_name: "finjoe_expense_approved",
    approval_name: "finjoe_expense_approved",
    body: "Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.",
    variables: { "1": "EXP001" },
  },
  {
    friendly_name: "finjoe_expense_rejected",
    approval_name: "finjoe_expense_rejected",
    body: "Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.",
    variables: { "1": "EXP001", "2": "Reason not provided" },
  },
  {
    friendly_name: "finjoe_re_engagement",
    approval_name: "finjoe_re_engagement",
    body: "Hello from Finance Joe! I'm here to help with expenses, income receipts, and any finance questions. Reply to get started or ask me anything.",
    variables: {},
  },
];

async function createTemplate(t) {
  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      friendly_name: t.friendly_name,
      language: "en",
      variables: t.variables,
      types: { "twilio/text": { body: t.body } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.sid;
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
  const sids = {};
  for (const t of templates) {
    try {
      const sid = await createTemplate(t);
      console.log(`Created ${t.friendly_name}: ${sid}`);
      await submitForApproval(sid, t.approval_name);
      console.log(`  Submitted for WhatsApp approval`);
      sids[t.friendly_name] = sid;
    } catch (err) {
      console.error(`Error for ${t.friendly_name}:`, err.message);
    }
  }

  if (!databaseUrl) {
    console.log("\nDATABASE_URL not set - skipping DB update. SIDs:", sids);
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query("SELECT id FROM finjoe_settings LIMIT 1");
    const row = result.rows?.[0];
    if (!row) {
      await pool.query(
        `INSERT INTO finjoe_settings (
          expense_approval_template_sid,
          expense_approved_template_sid,
          expense_rejected_template_sid,
          re_engagement_template_sid
        ) VALUES ($1, $2, $3, $4)`,
        [
          sids.finjoe_expense_approval || null,
          sids.finjoe_expense_approved || null,
          sids.finjoe_expense_rejected || null,
          sids.finjoe_re_engagement || null,
        ]
      );
      console.log("\nInserted finjoe_settings with template SIDs");
    } else {
      await pool.query(
        `UPDATE finjoe_settings SET
          expense_approval_template_sid = COALESCE($1, expense_approval_template_sid),
          expense_approved_template_sid = COALESCE($2, expense_approved_template_sid),
          expense_rejected_template_sid = COALESCE($3, expense_rejected_template_sid),
          re_engagement_template_sid = COALESCE($4, re_engagement_template_sid),
          updated_at = NOW()
        WHERE id = $5`,
        [
          sids.finjoe_expense_approval || null,
          sids.finjoe_expense_approved || null,
          sids.finjoe_expense_rejected || null,
          sids.finjoe_re_engagement || null,
          row.id,
        ]
      );
      console.log("\nUpdated finjoe_settings with template SIDs");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
