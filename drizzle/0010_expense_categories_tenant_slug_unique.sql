-- Replace legacy global slug uniqueness with per-tenant uniqueness so each org can use the same MIS slugs (e.g. rent_expenses).
ALTER TABLE "expense_categories" DROP CONSTRAINT IF EXISTS "expense_categories_slug_key";

-- One row per (tenant, slug) when tenant is set
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_tenant_id_slug_key"
  ON "expense_categories" ("tenant_id", "slug")
  WHERE "tenant_id" IS NOT NULL;

-- Legacy global template rows (tenant_id NULL): keep slug unique among globals only
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_global_slug_key"
  ON "expense_categories" ("slug")
  WHERE "tenant_id" IS NULL;
