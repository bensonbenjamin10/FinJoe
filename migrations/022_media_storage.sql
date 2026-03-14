-- Media storage: volume/S3 path and expense linkage for proof of transactions
-- Run via: psql $DATABASE_URL -f migrations/022_media_storage.sql

ALTER TABLE fin_joe_media ADD COLUMN IF NOT EXISTS storage_path varchar;
ALTER TABLE fin_joe_media ADD COLUMN IF NOT EXISTS expense_id varchar REFERENCES expenses(id);
ALTER TABLE fin_joe_media ALTER COLUMN data DROP NOT NULL;
