-- FinJoe: expenses
-- Run via: psql $DATABASE_URL -f migrations/003_expenses.sql

CREATE TABLE IF NOT EXISTS expenses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campus_id varchar REFERENCES campuses(id),
  category_id varchar NOT NULL REFERENCES expense_categories(id),
  amount integer NOT NULL,
  expense_date timestamp NOT NULL,
  description text,
  particulars text,
  status text NOT NULL DEFAULT 'draft',
  submitted_by_id varchar REFERENCES users(id),
  submitted_at timestamp,
  submitted_by_contact_phone varchar,
  approved_by_id varchar REFERENCES users(id),
  approved_at timestamp,
  rejection_reason text,
  payout_method text,
  payout_ref text,
  payout_at timestamp,
  source text NOT NULL DEFAULT 'finjoe',
  attachments jsonb NOT NULL DEFAULT '[]',
  invoice_number text,
  invoice_date timestamp,
  vendor_name text,
  gstin text,
  tax_type text,
  voucher_number text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
