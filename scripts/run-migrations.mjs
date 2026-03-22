#!/usr/bin/env node
/**
 * Run FinJoe migrations via drizzle-orm migrator.
 * Only applies NEW migrations (tracked in __drizzle_migrations).
 * Usage: node scripts/run-migrations.mjs
 *
 * Drizzle's migrate() is silent when nothing is pending — we print status
 * before/after so "Migrations complete" is interpretable.
 */

import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../drizzle");

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
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

function loadJournalTags() {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return journal.entries.map((e) => e.tag);
}

/** Same hash as drizzle-orm/migrator readMigrationFiles (full file contents). */
function migrationHash(tag) {
  const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
  const query = fs.readFileSync(sqlPath, "utf8");
  return crypto.createHash("sha256").update(query).digest("hex");
}

/** Drizzle stores the journal in schema `drizzle`, not `public` (see drizzle-orm PgDialect.migrate). */
const DRIZZLE_MIGRATIONS_TABLE = `"drizzle"."__drizzle_migrations"`;

async function fetchAppliedHashes(pool) {
  try {
    const r = await pool.query(`SELECT hash FROM ${DRIZZLE_MIGRATIONS_TABLE}`);
    return new Set(r.rows.map((row) => row.hash));
  } catch (err) {
    if (err.code === "42P01") {
      return new Set();
    }
    throw err;
  }
}

function printStatus(tags, applied) {
  let pending = 0;
  for (const tag of tags) {
    const hash = migrationHash(tag);
    const ok = applied.has(hash);
    if (!ok) pending += 1;
    console.log(`  ${ok ? "✓" : "·"} ${tag}`);
  }
  if (pending === 0) {
    console.log("  (none pending — Drizzle will not re-run applied migrations)");
  } else {
    console.log(`  → ${pending} pending — will apply now`);
  }
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const db = drizzle({ client: pool });

const tags = loadJournalTags();
const before = await fetchAppliedHashes(pool);

console.log(`Drizzle migrations folder: ${migrationsFolder}`);
console.log("Migration status (from __drizzle_migrations + journal file hashes):");
printStatus(tags, before);

console.log("\nRunning drizzle migrate()...");
await migrate(db, {
  migrationsFolder,
  migrationsSchema: "drizzle",
  migrationsTable: "__drizzle_migrations",
});

const after = await fetchAppliedHashes(pool);
const newly = tags.filter((tag) => {
  const h = migrationHash(tag);
  return after.has(h) && !before.has(h);
});
if (newly.length > 0) {
  console.log("Applied in this run:");
  for (const tag of newly) {
    console.log(`  + ${tag}`);
  }
}

await pool.end();
console.log("Migrations complete.");
