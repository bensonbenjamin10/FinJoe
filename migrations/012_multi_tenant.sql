-- FinJoe: Multi-tenant schema - tenants, tenant_waba_providers, tenant_id on all tables
-- Run via: psql $DATABASE_URL -f migrations/012_multi_tenant.sql

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 2. Create tenant_waba_providers table
CREATE TABLE IF NOT EXISTS tenant_waba_providers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  whatsapp_from text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- 3. Insert default tenant for existing data
INSERT INTO tenants (id, name, slug, is_active)
SELECT 'default', 'Default Organization', 'default', true
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'default');

-- 4. Add tenant_id to users (nullable for super_admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
-- Keep nullable for super_admin; existing users get default tenant

-- 5. Add tenant_id to campuses
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE campuses SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE campuses ALTER COLUMN tenant_id SET NOT NULL;

-- Drop old slug unique, add (tenant_id, slug) unique
ALTER TABLE campuses DROP CONSTRAINT IF EXISTS campuses_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS campuses_tenant_slug_unique ON campuses(tenant_id, slug);

-- 6. Add tenant_id to expense_categories (nullable = global template)
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE expense_categories SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
-- Keep nullable for global; existing get default

-- 7. Add tenant_id to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE expenses e SET tenant_id = COALESCE(
  (SELECT c.tenant_id FROM campuses c WHERE c.id = e.campus_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;
UPDATE expenses SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE expenses ALTER COLUMN tenant_id SET NOT NULL;

-- 8. Add tenant_id to fin_joe_contacts
-- First drop FK from conversations and role_change_requests that reference contact phone
ALTER TABLE fin_joe_conversations DROP CONSTRAINT IF EXISTS fin_joe_conversations_contact_phone_fkey;
ALTER TABLE fin_joe_role_change_requests DROP CONSTRAINT IF EXISTS fin_joe_role_change_requests_contact_phone_fkey;

ALTER TABLE fin_joe_contacts ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE fin_joe_contacts SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE fin_joe_contacts ALTER COLUMN tenant_id SET NOT NULL;

-- Drop old phone unique, add (tenant_id, phone) unique
ALTER TABLE fin_joe_contacts DROP CONSTRAINT IF EXISTS fin_joe_contacts_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS fin_joe_contacts_tenant_phone_unique ON fin_joe_contacts(tenant_id, phone);

-- 9. Add tenant_id to fin_joe_conversations (from contact)
ALTER TABLE fin_joe_conversations ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE fin_joe_conversations c SET tenant_id = (
  SELECT fc.tenant_id FROM fin_joe_contacts fc WHERE fc.phone = c.contact_phone AND fc.tenant_id IS NOT NULL LIMIT 1
) WHERE tenant_id IS NULL;
ALTER TABLE fin_joe_conversations ALTER COLUMN tenant_id SET NOT NULL;

-- Re-add FK for conversations (contact identified by tenant_id + phone)
ALTER TABLE fin_joe_conversations DROP CONSTRAINT IF EXISTS fin_joe_conversations_contact_fkey;
ALTER TABLE fin_joe_conversations ADD CONSTRAINT fin_joe_conversations_contact_fkey
  FOREIGN KEY (tenant_id, contact_phone) REFERENCES fin_joe_contacts(tenant_id, phone);

-- 10. Add tenant_id to fin_joe_role_change_requests
ALTER TABLE fin_joe_role_change_requests ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE fin_joe_role_change_requests r SET tenant_id = (
  SELECT fc.tenant_id FROM fin_joe_contacts fc WHERE fc.phone = r.contact_phone LIMIT 1
) WHERE tenant_id IS NULL;
ALTER TABLE fin_joe_role_change_requests ALTER COLUMN tenant_id SET NOT NULL;

-- Re-add FK for role_change_requests
ALTER TABLE fin_joe_role_change_requests DROP CONSTRAINT IF EXISTS fin_joe_role_change_requests_contact_fkey;
ALTER TABLE fin_joe_role_change_requests ADD CONSTRAINT fin_joe_role_change_requests_contact_fkey
  FOREIGN KEY (tenant_id, contact_phone) REFERENCES fin_joe_contacts(tenant_id, phone);

-- 11. Add tenant_id to fin_joe_tasks (from conversation)
ALTER TABLE fin_joe_tasks ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE fin_joe_tasks t SET tenant_id = (
  SELECT conv.tenant_id FROM fin_joe_conversations conv WHERE conv.id = t.conversation_id LIMIT 1
) WHERE tenant_id IS NULL;
ALTER TABLE fin_joe_tasks ALTER COLUMN tenant_id SET NOT NULL;

-- 12. Add tenant_id to finjoe_settings
ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE finjoe_settings SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
-- Insert default row for default tenant if none exists
INSERT INTO finjoe_settings (tenant_id, updated_at)
SELECT (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1), NOW()
WHERE NOT EXISTS (SELECT 1 FROM finjoe_settings WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1));
ALTER TABLE finjoe_settings ALTER COLUMN tenant_id SET NOT NULL;

-- finjoe_settings: one row per tenant
CREATE UNIQUE INDEX IF NOT EXISTS finjoe_settings_tenant_unique ON finjoe_settings(tenant_id);

-- 13. Add tenant_id to petty_cash_funds (via campus)
ALTER TABLE petty_cash_funds ADD COLUMN IF NOT EXISTS tenant_id varchar REFERENCES tenants(id);
UPDATE petty_cash_funds p SET tenant_id = (
  SELECT c.tenant_id FROM campuses c WHERE c.id = p.campus_id LIMIT 1
) WHERE tenant_id IS NULL;
ALTER TABLE petty_cash_funds ALTER COLUMN tenant_id SET NOT NULL;
