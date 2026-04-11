-- Shareable dashboard: add PIN hash and enabled flag to finjoe_settings
ALTER TABLE "finjoe_settings" ADD COLUMN IF NOT EXISTS "dashboard_pin_hash" text;
--> statement-breakpoint
ALTER TABLE "finjoe_settings" ADD COLUMN IF NOT EXISTS "dashboard_pin_enabled" boolean DEFAULT false;
