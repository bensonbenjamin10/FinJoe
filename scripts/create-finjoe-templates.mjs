#!/usr/bin/env node
/**
 * Create FinJoe WhatsApp Content Templates via Twilio Content API,
 * submit for approval, and update finjoe_settings in the database.
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DATABASE_URL
 * Optional: --tenant=<slug> or TENANT_ID env (tenant id or slug). Default: default tenant.
 * Optional: Load .env (node --env-file=.env)
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const { Pool } = pg;

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

const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
const tenantFromArg = tenantArg ? tenantArg.slice("--tenant=".length).trim() : null;
const tenantFromEnv = process.env.TENANT_ID?.trim() || null;
const tenantSlugOrId = tenantFromArg || tenantFromEnv || "default";

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
    let tenantId = tenantSlugOrId;
    const slugRow = await pool.query("SELECT id FROM tenants WHERE slug = $1 LIMIT 1", [tenantSlugOrId]);
    if (slugRow.rows?.[0]) {
      tenantId = slugRow.rows[0].id;
    } else {
      const idRow = await pool.query("SELECT id FROM tenants WHERE id = $1 LIMIT 1", [tenantSlugOrId]);
      if (!idRow.rows?.[0]) {
        console.error(`Tenant not found: ${tenantSlugOrId} (use slug or id)`);
        return;
      }
    }

    const result = await pool.query("SELECT id FROM finjoe_settings WHERE tenant_id = $1 LIMIT 1", [tenantId]);
    const row = result.rows?.[0];
    if (!row) {
      await pool.query(
        `INSERT INTO finjoe_settings (
          tenant_id,
          expense_approval_template_sid,
          expense_approved_template_sid,
          expense_rejected_template_sid,
          re_engagement_template_sid
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          sids.finjoe_expense_approval || null,
          sids.finjoe_expense_approved || null,
          sids.finjoe_expense_rejected || null,
          sids.finjoe_re_engagement || null,
        ]
      );
      console.log(`\nInserted finjoe_settings for tenant ${tenantId} with template SIDs`);
    } else {
      await pool.query(
        `UPDATE finjoe_settings SET
          expense_approval_template_sid = COALESCE($1, expense_approval_template_sid),
          expense_approved_template_sid = COALESCE($2, expense_approved_template_sid),
          expense_rejected_template_sid = COALESCE($3, expense_rejected_template_sid),
          re_engagement_template_sid = COALESCE($4, re_engagement_template_sid),
          updated_at = NOW()
        WHERE tenant_id = $5`,
        [
          sids.finjoe_expense_approval || null,
          sids.finjoe_expense_approved || null,
          sids.finjoe_expense_rejected || null,
          sids.finjoe_re_engagement || null,
          tenantId,
        ]
      );
      console.log(`\nUpdated finjoe_settings for tenant ${tenantId} with template SIDs`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
