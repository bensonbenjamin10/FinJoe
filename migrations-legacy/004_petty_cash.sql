-- FinJoe: petty_cash_funds
-- Run via: psql $DATABASE_URL -f migrations/004_petty_cash.sql

CREATE TABLE IF NOT EXISTS petty_cash_funds (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campus_id varchar NOT NULL REFERENCES campuses(id),
  custodian_id varchar NOT NULL REFERENCES users(id),
  imprest_amount integer NOT NULL,
  current_balance integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
