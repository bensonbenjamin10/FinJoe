#!/usr/bin/env node
/**
 * One-time: Add MIS-deficient expense categories for medpg tenant.
 * Run: node scripts/seed-mis-categories.mjs
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

const MIS_CATEGORIES = [
  { name: "Rent Expenses", slug: "rent_expenses", cashflowLabel: "Rent Expenses", displayOrder: 10 },
  { name: "Faculty Payments (Including Medico)", slug: "faculty_payments", cashflowLabel: "Faculty Payments (Including Medico)", displayOrder: 11 },
  { name: "Operating Expenses (Opex)", slug: "operating_expenses", cashflowLabel: "Operating Expenses (Opex)", displayOrder: 12 },
  { name: "Employee Benefit Expenses (Salary)", slug: "employee_benefit_expenses", cashflowLabel: "Employee Benefit Expenses (Salary expenses)", displayOrder: 13 },
  { name: "Advertising Expenses", slug: "advertising_expenses", cashflowLabel: "Advertising Expenses", displayOrder: 14 },
  { name: "Food Expenses (Mess Bill)", slug: "food_expenses_mess_bill", cashflowLabel: "Food Expenses (Mess Bill)", displayOrder: 15 },
  { name: "Commission Charges", slug: "commission_charges", cashflowLabel: "Commission Charges", displayOrder: 16 },
  { name: "Security Deposit Refund (SD Refund)", slug: "security_deposit_refund", cashflowLabel: "Security Deposit Refund (SD Refund)", displayOrder: 17 },
  { name: "Electricity Charges", slug: "electricity_charges", cashflowLabel: "Electricity Charges", displayOrder: 18 },
  { name: "Bank Charges", slug: "bank_charges", cashflowLabel: "Bank Charges", displayOrder: 19 },
  { name: "Income Tax & GST Payment", slug: "income_tax_gst_payment", cashflowLabel: "Income Tax & GST Payment", displayOrder: 20 },
  { name: "Legal Fee", slug: "legal_fee", cashflowLabel: "Legal Fee", displayOrder: 21 },
  { name: "TDS Payment", slug: "tds_payment", cashflowLabel: "TDS Payment", displayOrder: 22 },
  { name: "Capital Expenditures (Capex)", slug: "capital_expenditures", cashflowLabel: "Capital Expenditures (Capex)", displayOrder: 23 },
  { name: "Rent Deposit Paid", slug: "rent_deposit_paid", cashflowLabel: "Rent Deposit Paid", displayOrder: 24 },
  { name: "Rent Deposit Refund", slug: "rent_deposit_refund", cashflowLabel: "Rent Deposit Refund", displayOrder: 25 },
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
  for (const cat of MIS_CATEGORIES) {
    const check = await client.query(
      "SELECT id FROM expense_categories WHERE tenant_id = $1 AND slug = $2",
      [TENANT_ID, cat.slug]
    );
    if (check.rows.length > 0) {
      console.log("Skip (exists):", cat.name);
      continue;
    }
    await client.query(
      `INSERT INTO expense_categories (tenant_id, name, slug, cashflow_label, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [TENANT_ID, cat.name, cat.slug, cat.cashflowLabel, cat.displayOrder]
    );
    console.log("Added:", cat.name);
    created++;
  }
  console.log("\nDone. Created", created, "categories.");
} finally {
  client.release();
  await pool.end();
}
