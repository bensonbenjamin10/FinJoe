-- Password reset tokens (separate from invite tokens)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp;

-- Demo tenant TTL (null = no expiry)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "demo_expires_at" timestamp;
