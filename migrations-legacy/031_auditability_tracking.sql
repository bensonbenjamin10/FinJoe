ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS matched_by_id VARCHAR REFERENCES users(id);

ALTER TABLE recurring_expense_templates ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);
ALTER TABLE recurring_income_templates ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);

ALTER TABLE petty_cash_funds ADD COLUMN IF NOT EXISTS created_by_id VARCHAR REFERENCES users(id);
ALTER TABLE petty_cash_funds ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_id VARCHAR REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);

ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS created_by_id VARCHAR REFERENCES users(id);
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);

ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS created_by_id VARCHAR REFERENCES users(id);
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);

ALTER TABLE income_categories ADD COLUMN IF NOT EXISTS created_by_id VARCHAR REFERENCES users(id);
ALTER TABLE income_categories ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR REFERENCES users(id);