CREATE UNIQUE INDEX IF NOT EXISTS "payment_allocations_provider_ext_id_uniq"
  ON "payment_allocations" ("provider", "external_payment_id")
  WHERE "provider" IS NOT NULL AND "external_payment_id" IS NOT NULL;
