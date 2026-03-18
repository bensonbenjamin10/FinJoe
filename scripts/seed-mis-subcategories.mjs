#!/usr/bin/env node
/**
 * One-time: Add MIS sub-categories under parent expense categories for drill-downs.
 * Run: node scripts/seed-mis-subcategories.mjs
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

const SUB_CATEGORIES = {
  advertising_expenses: [
    { name: "FB Ads", slug: "fb_ads", displayOrder: 1 },
    { name: "Google Ads", slug: "google_ads", displayOrder: 2 },
    { name: "Promotional Expenses", slug: "promotional_expenses", displayOrder: 3 },
    { name: "Shoot Expenses", slug: "shoot_expenses", displayOrder: 4 },
    { name: "FPL Technologies", slug: "fpl_technologies", displayOrder: 5 },
    { name: "META", slug: "meta_ads", displayOrder: 6 },
    { name: "Other Marketing", slug: "other_marketing", displayOrder: 7 },
  ],
  capital_expenditures: [
    { name: "Air Conditioner", slug: "air_conditioner", displayOrder: 1 },
    { name: "Printer", slug: "printer", displayOrder: 2 },
    { name: "Computers", slug: "computers", displayOrder: 3 },
    { name: "Electrical Items & Fittings", slug: "electrical_items_fittings", displayOrder: 4 },
    { name: "Furniture & Fittings", slug: "furniture_fittings", displayOrder: 5 },
    { name: "Mattresses & Curtains", slug: "mattresses_curtains", displayOrder: 6 },
    { name: "Mobile", slug: "mobile", displayOrder: 7 },
  ],
  employee_benefit_expenses: [
    { name: "Salary Expenses", slug: "salary_expenses", displayOrder: 1 },
    { name: "Bonus & Other Perquisites", slug: "bonus_perquisites", displayOrder: 2 },
  ],
  operating_expenses: [
    { name: "Bank Charges", slug: "opex_bank_charges", displayOrder: 1 },
    { name: "Loan Processing Charges", slug: "loan_processing_charges", displayOrder: 2 },
    { name: "Accounting Charges", slug: "accounting_charges", displayOrder: 3 },
    { name: "Bizpay Fund Pooling & Petty Expenses", slug: "bizpay_petty", displayOrder: 4 },
    { name: "Commission Expenses", slug: "commission_expenses_sub", displayOrder: 5 },
    { name: "Internet & Telephone Charges", slug: "internet_telephone", displayOrder: 6 },
    { name: "Office Expenses", slug: "office_expenses", displayOrder: 7 },
    { name: "Other Expenses", slug: "other_expenses", displayOrder: 8 },
    { name: "Repair & Maintenance", slug: "repair_maintenance", displayOrder: 9 },
    { name: "Study Material Expenses", slug: "study_material_expenses", displayOrder: 10 },
    { name: "Subscription Charges", slug: "subscription_charges", displayOrder: 11 },
    { name: "Rental Registration Charges", slug: "rental_registration", displayOrder: 12 },
    { name: "Travel & Stay Expenses", slug: "travel_stay", displayOrder: 13 },
    { name: "Water Charges", slug: "water_charges", displayOrder: 14 },
    { name: "Printing Expenses", slug: "printing_expenses", displayOrder: 15 },
    { name: "Campus Shifting Expense", slug: "campus_shifting", displayOrder: 16 },
    { name: "TDS Payment", slug: "opex_tds_payment", displayOrder: 17 },
    { name: "Provision of Items", slug: "provision_items", displayOrder: 18 },
    { name: "Hostel Expenses", slug: "hostel_expenses", displayOrder: 19 },
    { name: "Staff Insurance", slug: "staff_insurance", displayOrder: 20 },
    { name: "Credit Card Charges", slug: "credit_card_charges", displayOrder: 21 },
    { name: "ITR Payment - Firm", slug: "itr_payment", displayOrder: 22 },
    { name: "Operating Expense (Other)", slug: "operating_expense_other", displayOrder: 23 },
  ],
};

const url = normalizeConnectionString(process.env.DATABASE_URL);
if (!url) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });

const client = await pool.connect();
try {
  let created = 0;
  for (const [parentSlug, children] of Object.entries(SUB_CATEGORIES)) {
    const parentRes = await client.query(
      "SELECT id FROM expense_categories WHERE tenant_id = $1 AND slug = $2",
      [TENANT_ID, parentSlug]
    );
    if (parentRes.rows.length === 0) {
      console.log("Parent not found, skipping:", parentSlug);
      continue;
    }
    const parentId = parentRes.rows[0].id;
    console.log(`\nParent: ${parentSlug} (${parentId})`);

    for (const sub of children) {
      const check = await client.query(
        "SELECT id FROM expense_categories WHERE tenant_id = $1 AND slug = $2",
        [TENANT_ID, sub.slug]
      );
      if (check.rows.length > 0) {
        console.log("  Skip (exists):", sub.name);
        continue;
      }
      await client.query(
        `INSERT INTO expense_categories (tenant_id, name, slug, cashflow_label, parent_id, display_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [TENANT_ID, sub.name, sub.slug, sub.name, parentId, sub.displayOrder]
      );
      console.log("  Added:", sub.name);
      created++;
    }
  }
  console.log("\nDone. Created", created, "sub-categories.");
} finally {
  client.release();
  await pool.end();
}
