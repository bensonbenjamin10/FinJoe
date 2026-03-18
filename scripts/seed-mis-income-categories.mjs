#!/usr/bin/env node
/**
 * One-time: Add MIS-aligned income categories for medpg tenant.
 * Run: node scripts/seed-mis-income-categories.mjs
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function normalizeConnectionString(url) {
  if (!url || typeof url !== "string") return url;
  const needsNoSsl =
    (url.includes(".railway.internal") || url.includes(".proxy.rlwy.net")) &&
    !url.includes("sslmode=");
  if (needsNoSsl) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "sslmode=disable";
  }
  return url;
}

const TENANT_ID = "5247ca10-cd99-4fa0-91f4-8c5dfdf83004"; // medpg

const MIS_INCOME_CATEGORIES = [
  { name: "Academic Income (Including Crash Batch)", slug: "academic_income", incomeType: "academic", displayOrder: 10 },
  { name: "Hostel Income (Including Electricity Charges)", slug: "hostel_income", incomeType: "hostel", displayOrder: 11 },
  { name: "Medico-Revenue", slug: "medico_revenue", incomeType: "medico", displayOrder: 12 },
  { name: "Security Deposit Collected", slug: "security_deposit_collected", incomeType: "deposit", displayOrder: 13 },
  { name: "Revenue Sharing Income (TIPS)", slug: "revenue_sharing_tips", incomeType: "revenue_share", displayOrder: 14 },
  { name: "Reading Room", slug: "reading_room", incomeType: "facility", displayOrder: 15 },
  { name: "Study Material", slug: "study_material", incomeType: "academic", displayOrder: 16 },
  { name: "Other Income", slug: "other_income", incomeType: "other", displayOrder: 17 },
];

const url = normalizeConnectionString(process.env.DATABASE_URL);
if (!url) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });

const client = await pool.connect();
try {
  let created = 0;
  for (const cat of MIS_INCOME_CATEGORIES) {
    const check = await client.query(
      "SELECT id FROM income_categories WHERE tenant_id = $1 AND slug = $2",
      [TENANT_ID, cat.slug]
    );
    if (check.rows.length > 0) {
      console.log("Skip (exists):", cat.name);
      continue;
    }
    await client.query(
      `INSERT INTO income_categories (tenant_id, name, slug, income_type, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [TENANT_ID, cat.name, cat.slug, cat.incomeType, cat.displayOrder]
    );
    console.log("Added:", cat.name);
    created++;
  }
  console.log("\nDone. Created", created, "income categories.");
} finally {
  client.release();
  await pool.end();
}
