-- FinJoe: fin_joe_contacts
-- Run via: psql $DATABASE_URL -f migrations/005_finjoe_contacts.sql

CREATE TABLE IF NOT EXISTS fin_joe_contacts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phone varchar NOT NULL UNIQUE,
  role varchar NOT NULL,
  student_id varchar REFERENCES users(id),
  name text,
  campus_id varchar REFERENCES campuses(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
