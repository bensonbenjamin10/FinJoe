-- FinJoe: finjoe_settings (Twilio template SIDs)
-- Run via: psql $DATABASE_URL -f migrations/011_finjoe_settings.sql

CREATE TABLE IF NOT EXISTS finjoe_settings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  expense_approval_template_sid text,
  expense_approved_template_sid text,
  expense_rejected_template_sid text,
  re_engagement_template_sid text,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Insert default row if empty
INSERT INTO finjoe_settings (id, updated_at)
SELECT gen_random_uuid()::text, now()
WHERE NOT EXISTS (SELECT 1 FROM finjoe_settings LIMIT 1);
