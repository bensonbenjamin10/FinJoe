/**
 * Migration: Add MIS-configurable columns + backfill existing categories.
 *
 * Run: node scripts/migrate-mis-configurable.mjs
 *
 * Idempotent: uses IF NOT EXISTS / WHERE checks.
 */

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function colExists(table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return r.rowCount > 0;
}

// ── Phase 1: Add columns ──

if (!(await colExists("expense_categories", "cashflow_section"))) {
  await client.query(`ALTER TABLE expense_categories ADD COLUMN cashflow_section text NOT NULL DEFAULT 'operating_outflow'`);
  console.log("Added expense_categories.cashflow_section");
}
if (!(await colExists("expense_categories", "pnl_section"))) {
  await client.query(`ALTER TABLE expense_categories ADD COLUMN pnl_section text NOT NULL DEFAULT 'indirect'`);
  console.log("Added expense_categories.pnl_section");
}
if (!(await colExists("expense_categories", "drilldown_mode"))) {
  await client.query(`ALTER TABLE expense_categories ADD COLUMN drilldown_mode text NOT NULL DEFAULT 'none'`);
  console.log("Added expense_categories.drilldown_mode");
}
if (!(await colExists("expense_categories", "mis_display_label"))) {
  await client.query(`ALTER TABLE expense_categories ADD COLUMN mis_display_label text`);
  console.log("Added expense_categories.mis_display_label");
}

if (!(await colExists("income_categories", "mis_classification"))) {
  await client.query(`ALTER TABLE income_categories ADD COLUMN mis_classification text NOT NULL DEFAULT 'revenue'`);
  console.log("Added income_categories.mis_classification");
}
if (!(await colExists("income_categories", "revenue_group"))) {
  await client.query(`ALTER TABLE income_categories ADD COLUMN revenue_group text`);
  console.log("Added income_categories.revenue_group");
}
if (!(await colExists("income_categories", "mis_display_label"))) {
  await client.query(`ALTER TABLE income_categories ADD COLUMN mis_display_label text`);
  console.log("Added income_categories.mis_display_label");
}

if (!(await colExists("finjoe_settings", "fy_start_month"))) {
  await client.query(`ALTER TABLE finjoe_settings ADD COLUMN fy_start_month integer NOT NULL DEFAULT 4`);
  console.log("Added finjoe_settings.fy_start_month");
}

// ── Phase 2: Backfill expense_categories ──

const INVESTING_SLUGS = ["capital_expenditures", "rent_deposit_paid", "rent_deposit_refund"];
const DIRECT_SLUGS = ["faculty_payments", "rent_expenses"];
const BY_CENTER_SLUGS = ["electricity_charges", "food_expenses_mess_bill"];
const BY_SUBCAT_SLUGS = ["advertising_expenses", "capital_expenditures", "employee_benefit_expenses", "operating_expenses"];

// investing categories: cashflow=investing, pnl=excluded
let r = await client.query(
  `UPDATE expense_categories SET cashflow_section='investing', pnl_section='excluded'
   WHERE slug = ANY($1) AND cashflow_section='operating_outflow'`,
  [INVESTING_SLUGS]
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} investing categories`);

// direct expense categories
r = await client.query(
  `UPDATE expense_categories SET pnl_section='direct'
   WHERE slug = ANY($1) AND pnl_section='indirect'`,
  [DIRECT_SLUGS]
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} direct expense categories`);

// drilldown_mode = by_center
r = await client.query(
  `UPDATE expense_categories SET drilldown_mode='by_center'
   WHERE slug = ANY($1) AND drilldown_mode='none' AND parent_id IS NULL`,
  [BY_CENTER_SLUGS]
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} by_center drilldown categories`);

// drilldown_mode = by_subcategory
r = await client.query(
  `UPDATE expense_categories SET drilldown_mode='by_subcategory'
   WHERE slug = ANY($1) AND drilldown_mode='none' AND parent_id IS NULL`,
  [BY_SUBCAT_SLUGS]
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} by_subcategory drilldown categories`);

// Sub-categories inherit none for cashflow/pnl (they roll up to parent)
r = await client.query(
  `UPDATE expense_categories SET cashflow_section='none', pnl_section='excluded'
   WHERE parent_id IS NOT NULL AND cashflow_section='operating_outflow'`
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} sub-categories set to none/excluded`);

// ── Phase 3: Backfill income_categories ──

r = await client.query(
  `UPDATE income_categories SET mis_classification='other_income'
   WHERE slug='other_income' AND mis_classification='revenue'`
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} other_income categories`);

r = await client.query(
  `UPDATE income_categories SET revenue_group='medico'
   WHERE slug='medico_revenue' AND revenue_group IS NULL`
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} medico revenue_group categories`);

// Set revenue_group='offline' for all non-medico, non-other revenue categories
r = await client.query(
  `UPDATE income_categories SET revenue_group='offline'
   WHERE mis_classification='revenue' AND revenue_group IS NULL AND slug != 'medico_revenue'`
);
if (r.rowCount) console.log(`Backfill: ${r.rowCount} offline revenue_group categories`);

console.log("\nMigration complete.");
await client.end();
