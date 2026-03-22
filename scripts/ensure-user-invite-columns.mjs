#!/usr/bin/env node
/**
 * Idempotent DDL: add users.invite_token_hash / invite_token_expires_at.
 *
 * Use when the app errors on SELECT ... invite_token_* but migrations did not
 * run against this DATABASE_URL (e.g. prod vs local .env, or a blocked migration).
 *
 *   npm run db:repair-invite-columns
 *
 * Requires DATABASE_URL (same as the running API — e.g. Railway URL in CI or .env).
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function normalizeConnectionString(url) {
  if (!url || typeof url !== "string") return url;
  const needsNoSsl =
    (url.includes(".railway.internal") || url.includes(".proxy.rlwy.net")) &&
    !url.includes("sslmode=");
  if (needsNoSsl) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "sslmode=disable";
  }
  return url;
}

const DATABASE_URL = normalizeConnectionString(process.env.DATABASE_URL);
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (same DB your server uses).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
});

try {
  await pool.query(
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_hash" text`
  );
  await pool.query(
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_expires_at" timestamp`
  );
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('invite_token_hash', 'invite_token_expires_at')
    ORDER BY column_name
  `);
  console.log("Invite columns on public.users:", rows.map((r) => r.column_name).join(", ") || "(none — unexpected)");
  if (rows.length === 2) {
    console.log("OK — invite columns are present.");
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
} finally {
  await pool.end();
}
