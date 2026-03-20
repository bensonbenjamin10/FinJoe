#!/usr/bin/env node
/**
 * Run scripts/wipe-financial-data.sql against DATABASE_URL (no psql required).
 * Wipes all financial data for every tenant — see SQL file for scope.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/wipe-financial-data.mjs
 *
 * Or put DATABASE_URL in .env and:
 *   node scripts/wipe-financial-data.mjs
 *
 * PowerShell (Railway URL — use quotes):
 *   $env:DATABASE_URL = "postgresql://postgres:PASSWORD@host:port/railway"
 *   node scripts/wipe-financial-data.mjs
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (e.g. in .env or Railway variables).");
  console.error("On Windows without psql, use: node scripts/wipe-financial-data.mjs");
  process.exit(1);
}

const sqlPath = path.join(__dirname, "wipe-financial-data.sql");
let sql = fs.readFileSync(sqlPath, "utf8");
// Remove line comments so we can paste a clean script; keep BEGIN/COMMIT block intact
sql = sql
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n")
  .trim();

const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 30000 });

async function main() {
  console.log("Running wipe-financial-data.sql …");
  await pool.query(sql);
  console.log("Done. Financial data wiped (all tenants).");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
