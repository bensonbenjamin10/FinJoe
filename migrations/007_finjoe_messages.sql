-- FinJoe: fin_joe_messages
-- Run via: psql $DATABASE_URL -f migrations/007_finjoe_messages.sql

CREATE TABLE IF NOT EXISTS fin_joe_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id varchar NOT NULL REFERENCES fin_joe_conversations(id) ON DELETE CASCADE,
  direction varchar NOT NULL,
  body text,
  message_sid varchar UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);
