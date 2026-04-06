CREATE TABLE IF NOT EXISTS cfo_insight_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start varchar(10) NOT NULL,
  period_end varchar(10) NOT NULL,
  facts_json jsonb NOT NULL,
  insight_json jsonb,
  model text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cfo_insight_snapshots_tenant_created_idx ON cfo_insight_snapshots (tenant_id, created_at DESC);
