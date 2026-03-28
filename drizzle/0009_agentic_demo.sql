ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "real_tenant_id" varchar REFERENCES "tenants"("id");
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sales_assistance_requested" boolean NOT NULL DEFAULT false;
