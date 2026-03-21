-- Outbound send idempotency for WhatsApp/SMS notifications
-- Run via: psql $DATABASE_URL -f migrations/028_finjoe_outbound_idempotency.sql

CREATE TABLE IF NOT EXISTS fin_joe_outbound_idempotency (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id varchar NOT NULL REFERENCES fin_joe_conversations(id) ON DELETE CASCADE,
  inbound_message_sid varchar NOT NULL,
  idempotency_key varchar NOT NULL,
  payload_hash varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight', 'sent', 'failed')),
  provider_message_sid varchar,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_joe_outbound_idempotency_tenant_key_uidx
  ON fin_joe_outbound_idempotency(tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS fin_joe_outbound_idempotency_conversation_idx
  ON fin_joe_outbound_idempotency(conversation_id, created_at DESC);
