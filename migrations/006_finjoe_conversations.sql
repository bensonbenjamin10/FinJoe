-- FinJoe: fin_joe_conversations
-- Run via: psql $DATABASE_URL -f migrations/006_finjoe_conversations.sql

CREATE TABLE IF NOT EXISTS fin_joe_conversations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact_phone varchar NOT NULL REFERENCES fin_joe_contacts(phone),
  last_message_at timestamp NOT NULL,
  status varchar NOT NULL DEFAULT 'active',
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
