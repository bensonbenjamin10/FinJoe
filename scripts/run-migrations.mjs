#!/usr/bin/env node
/**
 * Run FinJoe migrations using pg (no psql required).
 * Usage: node scripts/run-migrations.mjs
 */

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const migrationsDir = join(rootDir, "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Running ${files.length} migrations...`);

for (const file of files) {
  const path = join(migrationsDir, file);
  const sql = readFileSync(path, "utf8");
  try {
    await pool.query(sql);
  } catch (err) {
    if (err.code === "42P07") {
      console.log(`  (skipped - already exists: ${file})`);
    } else {
      console.error(`  ✗ ${file}:`, err.message);
      throw err;
    }
  }
  console.log(`  ✓ ${file}`);
}

await pool.end();
console.log("Migrations complete.");
