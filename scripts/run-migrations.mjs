#!/usr/bin/env node
/**
 * Run FinJoe migrations via drizzle-orm migrator.
 * Only applies NEW migrations (tracked in __drizzle_migrations).
 * Usage: node scripts/run-migrations.mjs
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const db = drizzle({ client: pool });

console.log("Running drizzle migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Migrations complete.");
