-- FinJoe: Configurable income types per tenant
-- Run via: psql $DATABASE_URL -f migrations/018_income_types.sql

CREATE TABLE IF NOT EXISTS income_types (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug varchar NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS income_types_tenant_idx ON income_types(tenant_id);

-- Seed default income types for existing tenants (education-institute defaults)
INSERT INTO income_types (tenant_id, slug, label, display_order)
SELECT t.id, 'registration_fee', 'Registration Fee', 0 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM income_types it WHERE it.tenant_id = t.id AND it.slug = 'registration_fee');
INSERT INTO income_types (tenant_id, slug, label, display_order)
SELECT t.id, 'remaining_fee', 'Remaining Fee', 1 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM income_types it WHERE it.tenant_id = t.id AND it.slug = 'remaining_fee');
INSERT INTO income_types (tenant_id, slug, label, display_order)
SELECT t.id, 'hostel_fee', 'Hostel Fee', 2 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM income_types it WHERE it.tenant_id = t.id AND it.slug = 'hostel_fee');
INSERT INTO income_types (tenant_id, slug, label, display_order)
SELECT t.id, 'other', 'Other', 3 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM income_types it WHERE it.tenant_id = t.id AND it.slug = 'other');
