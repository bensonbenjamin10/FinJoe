-- Allow bank-import rows when CSV date is missing or unparseable (still import amount / particulars).
-- Run via: psql $DATABASE_URL -f migrations/033_nullable_expense_income_bank_dates.sql

ALTER TABLE expenses ALTER COLUMN expense_date DROP NOT NULL;
ALTER TABLE income_records ALTER COLUMN income_date DROP NOT NULL;

-- Bank line from import: may mirror expense/income with no transaction date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_transactions'
  ) THEN
    ALTER TABLE bank_transactions ALTER COLUMN transaction_date DROP NOT NULL;
  END IF;
END $$;
