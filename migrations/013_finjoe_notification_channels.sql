-- FinJoe: notification channels (email, SMS fallback)
-- Run via: psql $DATABASE_URL -f migrations/013_finjoe_notification_channels.sql

ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS notification_emails text;
ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS resend_from_email text;
ALTER TABLE finjoe_settings ADD COLUMN IF NOT EXISTS sms_from text;
