-- Petty cash replenishment audit + expense links
CREATE TABLE IF NOT EXISTS petty_cash_replenishments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  fund_id varchar NOT NULL REFERENCES petty_cash_funds(id),
  total_amount integer NOT NULL,
  payout_method text,
  payout_ref text,
  recorded_by_id varchar REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS petty_cash_fund_id varchar REFERENCES petty_cash_funds(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS petty_cash_replenishment_id varchar REFERENCES petty_cash_replenishments(id);

CREATE INDEX IF NOT EXISTS expenses_petty_cash_fund_id_idx ON expenses (petty_cash_fund_id);
CREATE INDEX IF NOT EXISTS expenses_petty_cash_replenishment_id_idx ON expenses (petty_cash_replenishment_id);
