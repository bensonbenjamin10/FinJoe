-- FinJoe: Recurring income templates for auto-generating income records (monthly fees, rent, etc.)
-- Run via: npm run db:migrate

CREATE TABLE IF NOT EXISTS recurring_income_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cost_center_id varchar REFERENCES cost_centers(id),
  category_id varchar NOT NULL REFERENCES income_categories(id),
  amount integer NOT NULL,
  particulars text,
  income_type varchar NOT NULL DEFAULT 'other',
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

CREATE INDEX IF NOT EXISTS recurring_income_templates_tenant_idx ON recurring_income_templates(tenant_id);
CREATE INDEX IF NOT EXISTS recurring_income_templates_next_run_idx ON recurring_income_templates(next_run_date) WHERE is_active = true;

ALTER TABLE income_records ADD COLUMN IF NOT EXISTS recurring_template_id varchar REFERENCES recurring_income_templates(id);
