-- Wipe all financial transaction data (every tenant). Safe to run when migrations are current.
--
-- REMOVES:
--   - expenses, income_records, bank_transactions
--   - fin_joe_media rows linked to expenses (proof images)
--   - fin_joe_tasks.expense_id references
--
-- PRESERVES:
--   - tenants, users, sessions, settings
--   - cost_centers, expense_categories, income_categories, income_types
--   - recurring_*_templates, petty_cash_funds, fin_joe_contacts, WhatsApp threads (except expense media above)
--
-- Railway / local (bash, needs psql client):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/wipe-financial-data.sql
--
-- Windows (no psql): set DATABASE_URL then:
--   node scripts/wipe-financial-data.mjs
--   npm run db:wipe-financial

BEGIN;

-- 1) Remove expense-linked media blobs (keeps message-only media)
DELETE FROM fin_joe_media
WHERE expense_id IS NOT NULL;

-- 2) Break task → expense links
UPDATE fin_joe_tasks
SET expense_id = NULL
WHERE expense_id IS NOT NULL;

-- 3) Bank import / reconciliation rows (break cycles with expenses/income first)
UPDATE bank_transactions
SET matched_expense_id = NULL,
    matched_income_id = NULL;

UPDATE expenses
SET bank_transaction_id = NULL
WHERE bank_transaction_id IS NOT NULL;

UPDATE income_records
SET bank_transaction_id = NULL
WHERE bank_transaction_id IS NOT NULL;

DELETE FROM bank_transactions;

-- 4) Ledger rows
DELETE FROM income_records;
DELETE FROM expenses;

COMMIT;
