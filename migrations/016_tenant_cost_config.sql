-- FinJoe: Add cost center label and type config to finjoe_settings
-- Run via: psql $DATABASE_URL -f migrations/016_tenant_cost_config.sql

ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS cost_center_label varchar DEFAULT 'Cost Center';
ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS cost_center_type varchar DEFAULT 'campus';

-- Update existing rows with defaults
UPDATE finjoe_settings SET cost_center_label = 'Cost Center' WHERE cost_center_label IS NULL;
UPDATE finjoe_settings SET cost_center_type = 'campus' WHERE cost_center_type IS NULL;
