#!/usr/bin/env node
/**
 * Reset financial transaction data for a tenant (expenses, income_records).
 * Preserves: cost centers, users, categories, petty cash funds (resets balance to imprest).
 *
 * Usage: node scripts/reset-tenant-transactions.mjs [tenant-slug]
 * Example: node scripts/reset-tenant-transactions.mjs medpg
 *
 * Requires DATABASE_URL in .env
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const tenantSlug = process.argv[2] || "medpg";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 15000 });

async function main() {
  // 1. Get tenant_id for slug
  const tenantRes = await pool.query(
    "SELECT id, name FROM tenants WHERE slug = $1 LIMIT 1",
    [tenantSlug]
  );
  const tenant = tenantRes.rows?.[0];
  if (!tenant) {
    console.error(`Tenant not found: ${tenantSlug}`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenantSlug}) id=${tenantId}`);

  // 2. Count before
  const [expCount] = (
    await pool.query(
      "SELECT COUNT(*)::int as c FROM expenses WHERE tenant_id = $1",
      [tenantId]
    )
  ).rows;
  const [incCount] = (
    await pool.query(
      "SELECT COUNT(*)::int as c FROM income_records WHERE tenant_id = $1",
      [tenantId]
    )
  ).rows;
  const bankTable = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_transactions' LIMIT 1"
  );
  const hasBankTxns = bankTable.rows.length > 0;

  let bankCount = 0;
  if (hasBankTxns) {
    const [b] = (
      await pool.query(
        "SELECT COUNT(*)::int as c FROM bank_transactions WHERE tenant_id = $1",
        [tenantId]
      )
    ).rows;
    bankCount = b.c;
  }

  console.log(
    `Before: ${expCount.c} expenses, ${incCount.c} income records` +
      (hasBankTxns ? `, ${bankCount} bank_transactions` : "")
  );

  if (expCount.c === 0 && incCount.c === 0 && (!hasBankTxns || bankCount === 0)) {
    console.log("No transaction data to reset.");
    await pool.end();
    return;
  }

  // 3. Expense-linked media for this tenant
  const mediaDel = await pool.query(
    `DELETE FROM fin_joe_media
     WHERE expense_id IN (SELECT id FROM expenses WHERE tenant_id = $1)`,
    [tenantId]
  );
  if ((mediaDel.rowCount ?? 0) > 0) {
    console.log(`Deleted ${mediaDel.rowCount} fin_joe_media row(s) tied to expenses`);
  }

  // 4. Clear expense_id in fin_joe_tasks (FK reference)
  const tasksRes = await pool.query(
    `UPDATE fin_joe_tasks SET expense_id = NULL
     WHERE expense_id IN (SELECT id FROM expenses WHERE tenant_id = $1)
     RETURNING id`,
    [tenantId]
  );
  const tasksCleared = tasksRes.rowCount ?? 0;
  if (tasksCleared > 0) {
    console.log(`Cleared expense_id from ${tasksCleared} fin_joe_tasks`);
  }

  // 5. Bank transactions for tenant (if table exists)
  if (hasBankTxns) {
    await pool.query(
      `UPDATE bank_transactions SET matched_expense_id = NULL, matched_income_id = NULL
       WHERE tenant_id = $1`,
      [tenantId]
    );
    await pool.query(
      `UPDATE expenses SET bank_transaction_id = NULL
       WHERE tenant_id = $1 AND bank_transaction_id IS NOT NULL`,
      [tenantId]
    );
    await pool.query(
      `UPDATE income_records SET bank_transaction_id = NULL
       WHERE tenant_id = $1 AND bank_transaction_id IS NOT NULL`,
      [tenantId]
    );
    const delBank = await pool.query(
      "DELETE FROM bank_transactions WHERE tenant_id = $1",
      [tenantId]
    );
    if ((delBank.rowCount ?? 0) > 0) {
      console.log(`Deleted ${delBank.rowCount} bank_transactions`);
    }
  }

  // 6. Delete expenses
  const delExp = await pool.query(
    "DELETE FROM expenses WHERE tenant_id = $1",
    [tenantId]
  );
  console.log(`Deleted ${delExp.rowCount ?? 0} expenses`);

  // 7. Delete income_records
  const delInc = await pool.query(
    "DELETE FROM income_records WHERE tenant_id = $1",
    [tenantId]
  );
  console.log(`Deleted ${delInc.rowCount ?? 0} income records`);

  // 8. Reset petty_cash_funds balance to imprest_amount (no transaction history = full imprest)
  const resetPetty = await pool.query(
    `UPDATE petty_cash_funds
     SET current_balance = imprest_amount, updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId]
  );
  if ((resetPetty.rowCount ?? 0) > 0) {
    console.log(`Reset ${resetPetty.rowCount} petty cash fund(s) to imprest`);
  }

  console.log("Done. Transaction data reset for tenant " + tenantSlug);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
