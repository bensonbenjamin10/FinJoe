-- FinJoe: Add GST and expense fields to recurring expense templates
-- Run via: psql $DATABASE_URL -f migrations/027_recurring_template_expense_fields.sql

ALTER TABLE recurring_expense_templates ADD COLUMN IF NOT EXISTS gstin text;
ALTER TABLE recurring_expense_templates ADD COLUMN IF NOT EXISTS tax_type text;
ALTER TABLE recurring_expense_templates ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE recurring_expense_templates ADD COLUMN IF NOT EXISTS voucher_number text;
