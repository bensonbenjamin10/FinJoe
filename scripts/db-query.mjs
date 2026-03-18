#!/usr/bin/env node
/**
 * Run arbitrary SQL against the FinJoe database.
 * Handles Railway connection quirks (internal + public proxy).
 *
 * Usage:
 *   npm run db:query -- "SELECT * FROM expense_categories"
 *   npm run db:query -- "SELECT * FROM income_categories LIMIT 5"
 *   node scripts/db-query.mjs "SELECT * FROM tenants"
 *
 * Requires: DATABASE_URL in .env (or environment)
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function normalizeConnectionString(url) {
  if (!url || typeof url !== "string") return url;
  // Railway internal (*.railway.internal) and public proxy (*.proxy.rlwy.net)
  // need sslmode=disable - TLS is handled at the edge
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
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

const sql = process.argv[2];
if (!sql) {
  console.error("Usage: npm run db:query -- \"SELECT ...\"");
  console.error("   or: node scripts/db-query.mjs \"SELECT ...\"");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
});

try {
  const result = await pool.query(sql);
  if (result.rows.length === 0) {
    console.log("(0 rows)");
  } else {
    console.log(`(${result.rows.length} row${result.rows.length === 1 ? "" : "s"})`);
    console.table(result.rows);
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
