ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_expires_at timestamp;
