-- FinJoe: Recurring expense templates for auto-generating draft expenses (rent, salaries, etc.)
-- Run via: psql $DATABASE_URL -f migrations/020_recurring_expense_templates.sql

CREATE TABLE IF NOT EXISTS recurring_expense_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cost_center_id varchar REFERENCES cost_centers(id),
  category_id varchar NOT NULL REFERENCES expense_categories(id),
  amount integer NOT NULL,
  description text,
  vendor_name text,
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'weekly', 'quarterly')),
  day_of_month integer CHECK (day_of_month >= 1 AND day_of_month <= 31),
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  next_run_date date NOT NULL,
  created_by_id varchar REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_expense_templates_tenant_idx ON recurring_expense_templates(tenant_id);
CREATE INDEX IF NOT EXISTS recurring_expense_templates_next_run_idx ON recurring_expense_templates(next_run_date) WHERE is_active = true;

-- Optional: link generated expenses back to template for traceability
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_template_id varchar REFERENCES recurring_expense_templates(id);
