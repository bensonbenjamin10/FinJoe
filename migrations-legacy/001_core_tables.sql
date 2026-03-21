-- FinJoe: campuses and expense_categories
-- Run via: psql $DATABASE_URL -f migrations/001_core_tables.sql

CREATE TABLE IF NOT EXISTS campuses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id varchar,
  display_order integer NOT NULL DEFAULT 0,
  cashflow_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
