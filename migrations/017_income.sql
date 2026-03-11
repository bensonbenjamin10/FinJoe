-- FinJoe: Income categories and income records for complete finance management
-- Run via: psql $DATABASE_URL -f migrations/017_income.sql

-- 1. Income categories (tenant-scoped)
CREATE TABLE IF NOT EXISTS income_categories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  slug text NOT NULL,
  income_type varchar NOT NULL DEFAULT 'other',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- 2. Income records
CREATE TABLE IF NOT EXISTS income_records (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  cost_center_id varchar REFERENCES cost_centers(id),
  category_id varchar REFERENCES income_categories(id),
  amount integer NOT NULL,
  income_date timestamp NOT NULL,
  particulars text,
  income_type varchar NOT NULL DEFAULT 'other',
  source varchar NOT NULL DEFAULT 'manual',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS income_records_tenant_date_idx ON income_records(tenant_id, income_date);
CREATE INDEX IF NOT EXISTS income_records_cost_center_idx ON income_records(cost_center_id);
CREATE INDEX IF NOT EXISTS income_records_category_idx ON income_records(category_id);
