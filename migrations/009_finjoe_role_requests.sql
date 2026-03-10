-- FinJoe: fin_joe_role_change_requests
-- Run via: psql $DATABASE_URL -f migrations/009_finjoe_role_requests.sql

CREATE TABLE IF NOT EXISTS fin_joe_role_change_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact_phone varchar NOT NULL REFERENCES fin_joe_contacts(phone),
  requested_role varchar NOT NULL,
  name text,
  campus_id varchar REFERENCES campuses(id),
  student_id varchar REFERENCES users(id),
  status varchar NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  approved_by varchar REFERENCES users(id),
  approved_at timestamp,
  approved_via varchar,
  rejection_reason text
);
