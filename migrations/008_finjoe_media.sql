-- FinJoe: fin_joe_media
-- Run via: psql $DATABASE_URL -f migrations/008_finjoe_media.sql

CREATE TABLE IF NOT EXISTS fin_joe_media (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id varchar NOT NULL REFERENCES fin_joe_messages(id) ON DELETE CASCADE,
  content_type varchar NOT NULL,
  file_name varchar,
  data bytea NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
