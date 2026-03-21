ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email text;
