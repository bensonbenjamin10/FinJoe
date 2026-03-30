-- At most one active row per WhatsApp sender number (avoids nondeterministic tenant resolution).
-- Resolve duplicates in data before applying if this fails: keep one active row per whatsapp_from, deactivate others.
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_waba_providers_whatsapp_from_active_unique"
  ON "tenant_waba_providers" ("whatsapp_from")
  WHERE "is_active" = true;
