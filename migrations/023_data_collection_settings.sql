-- FinJoe: Data collection and confirmation settings (Option C - configurable)
-- Run via: psql $DATABASE_URL -f migrations/023_data_collection_settings.sql

-- Add columns to finjoe_settings for configurable data collection behavior
ALTER TABLE finjoe_settings
  ADD COLUMN IF NOT EXISTS require_confirmation_before_post boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_audit_fields_above_amount integer,
  ADD COLUMN IF NOT EXISTS ask_optional_fields boolean DEFAULT false;

COMMENT ON COLUMN finjoe_settings.require_confirmation_before_post IS 'When true, agent and admin UI must show confirmation before posting expense/income';
COMMENT ON COLUMN finjoe_settings.require_audit_fields_above_amount IS 'Enforce invoiceNumber, invoiceDate, vendorName for expenses above this amount (null = never enforce)';
COMMENT ON COLUMN finjoe_settings.ask_optional_fields IS 'When true, agent asks for optional fields (GSTIN, tax type) when relevant before posting';
