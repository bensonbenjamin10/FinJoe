ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "billing_gstin" text;
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "billing_state_code" text;
