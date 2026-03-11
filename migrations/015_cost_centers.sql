-- FinJoe: Rename campuses to cost_centers for industry-agnostic Cost Centers model
-- Run via: psql $DATABASE_URL -f migrations/015_cost_centers.sql

-- 1. Create cost_centers table (campuses + type column)
CREATE TABLE IF NOT EXISTS cost_centers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  slug text NOT NULL,
  type varchar,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- 2. Copy data from campuses
INSERT INTO cost_centers (id, tenant_id, name, slug, type, is_active, created_at, updated_at)
SELECT id, tenant_id, name, slug, 'campus', is_active, created_at, updated_at
FROM campuses
ON CONFLICT DO NOTHING;

-- 3. Add cost_center_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS cost_center_id varchar REFERENCES cost_centers(id);
UPDATE users SET cost_center_id = campus_id WHERE campus_id IS NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS campus_id;

-- 4. Add cost_center_id to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cost_center_id varchar REFERENCES cost_centers(id);
UPDATE expenses SET cost_center_id = campus_id WHERE campus_id IS NOT NULL;
ALTER TABLE expenses DROP COLUMN IF EXISTS campus_id;

-- 5. Add cost_center_id to petty_cash_funds
ALTER TABLE petty_cash_funds ADD COLUMN IF NOT EXISTS cost_center_id varchar REFERENCES cost_centers(id);
UPDATE petty_cash_funds SET cost_center_id = campus_id WHERE campus_id IS NOT NULL;
ALTER TABLE petty_cash_funds DROP COLUMN IF EXISTS campus_id;
ALTER TABLE petty_cash_funds ALTER COLUMN cost_center_id SET NOT NULL;

-- 6. Add cost_center_id to fin_joe_contacts
ALTER TABLE fin_joe_contacts ADD COLUMN IF NOT EXISTS cost_center_id varchar REFERENCES cost_centers(id);
UPDATE fin_joe_contacts SET cost_center_id = campus_id WHERE campus_id IS NOT NULL;
ALTER TABLE fin_joe_contacts DROP COLUMN IF EXISTS campus_id;

-- 7. Add cost_center_id to fin_joe_role_change_requests
ALTER TABLE fin_joe_role_change_requests ADD COLUMN IF NOT EXISTS cost_center_id varchar REFERENCES cost_centers(id);
UPDATE fin_joe_role_change_requests SET cost_center_id = campus_id WHERE campus_id IS NOT NULL;
ALTER TABLE fin_joe_role_change_requests DROP COLUMN IF EXISTS campus_id;

-- 8. Drop campuses table
DROP TABLE IF EXISTS campuses;
