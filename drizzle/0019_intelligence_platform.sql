-- Intelligence Platform: add periodKey + healthTestsJson to cfo_insight_snapshots
ALTER TABLE "cfo_insight_snapshots" ADD COLUMN IF NOT EXISTS "period_key" varchar(64);
--> statement-breakpoint
ALTER TABLE "cfo_insight_snapshots" ADD COLUMN IF NOT EXISTS "health_tests_json" jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfo_insight_snapshots_tenant_period_key_idx"
  ON "cfo_insight_snapshots" ("tenant_id", "period_key", "created_at" DESC);
