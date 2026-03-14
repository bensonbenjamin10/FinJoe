-- Cron run history for admin visibility
-- Run via: psql $DATABASE_URL -f migrations/024_cron_runs.sql

CREATE TABLE IF NOT EXISTS cron_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_name varchar NOT NULL,
  status varchar NOT NULL CHECK (status IN ('success', 'error')),
  result_json jsonb,
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp,
  error_message text
);

CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx ON cron_runs(job_name, started_at DESC);
