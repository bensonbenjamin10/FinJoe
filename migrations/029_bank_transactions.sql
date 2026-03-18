-- Bank transactions table for storing raw bank statement lines
-- Run via: psql $DATABASE_URL -f migrations/029_bank_transactions.sql

CREATE TABLE IF NOT EXISTS bank_transactions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  transaction_date timestamp NOT NULL,
  particulars text,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('debit', 'credit')),
  running_balance integer,
  raw_csv_row jsonb,
  import_batch_id varchar,
  reconciliation_status text NOT NULL DEFAULT 'unmatched' CHECK (reconciliation_status IN ('unmatched', 'matched', 'auto_from_import')),
  matched_expense_id varchar REFERENCES expenses(id),
  matched_income_id varchar REFERENCES income_records(id),
  match_confidence text CHECK (match_confidence IN ('exact', 'close', 'amount_only', 'ai', 'manual')),
  matched_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_txn_tenant_date_idx ON bank_transactions(tenant_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS bank_txn_recon_status_idx ON bank_transactions(tenant_id, reconciliation_status);
CREATE INDEX IF NOT EXISTS bank_txn_import_batch_idx ON bank_transactions(import_batch_id);

-- Add bank_transaction_id FK to expenses and income_records for reverse lookup
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bank_transaction_id varchar REFERENCES bank_transactions(id);
ALTER TABLE income_records ADD COLUMN IF NOT EXISTS bank_transaction_id varchar REFERENCES bank_transactions(id);

CREATE INDEX IF NOT EXISTS expenses_bank_txn_idx ON expenses(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS income_records_bank_txn_idx ON income_records(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
