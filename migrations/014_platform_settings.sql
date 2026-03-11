-- Platform settings - single row for account-level defaults (super admin)
-- Run via: psql $DATABASE_URL -f migrations/014_platform_settings.sql

CREATE TABLE IF NOT EXISTS platform_settings (
  id varchar PRIMARY KEY DEFAULT 'default',
  default_notification_emails text,
  default_resend_from_email text,
  default_sms_from text,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (id, updated_at) VALUES ('default', now())
ON CONFLICT (id) DO NOTHING;
