ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_regime" text NOT NULL DEFAULT 'flat_percent';
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_regime_config" jsonb DEFAULT '{}'::jsonb;
