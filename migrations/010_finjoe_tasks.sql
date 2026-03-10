-- FinJoe: fin_joe_tasks
-- Run via: psql $DATABASE_URL -f migrations/010_finjoe_tasks.sql

CREATE TABLE IF NOT EXISTS fin_joe_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id varchar NOT NULL REFERENCES fin_joe_conversations(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  status varchar NOT NULL,
  expense_id varchar REFERENCES expenses(id),
  payload jsonb NOT NULL DEFAULT '{}',
  assigned_to_phone varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
