-- Session store for express-session (connect-pg-simple)
-- Run via: psql $DATABASE_URL -f migrations/019_session_store.sql
-- Note: connect-pg-simple can create this automatically with createTableIfMissing: true

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL PRIMARY KEY,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
