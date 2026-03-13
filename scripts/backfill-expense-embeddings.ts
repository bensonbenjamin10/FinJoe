#!/usr/bin/env node
/**
 * Standalone backfill script for expense embeddings (RAG/semantic search).
 * Processes expenses where embedding IS NULL, in batches.
 *
 * Usage: npm run backfill:embeddings
 * Requires: DATABASE_URL, GEMINI_API_KEY
 *
 * Note: The worker also runs backfill on startup and via /cron/backfill-embeddings.
 */

import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { runBackfillEmbeddings } from "../lib/backfill-embeddings.js";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  // Manual run: no limit (or use BACKFILL_EMBEDDINGS_MAX_PER_RUN env for partial runs)
  const result = await runBackfillEmbeddings(pool, { maxPerRun: 0 }); // 0 = no limit
  await pool.end();

  if (result.skipped) {
    console.log("Skipped (no GEMINI_API_KEY or no expenses to process).");
    return;
  }
  if (result.total === 0) {
    console.log("No expenses need embedding. Done.");
    return;
  }
  const remaining = result.remaining ?? 0;
  console.log(`Done. Embedded ${result.processed} expenses, ${result.errors} errors.${remaining > 0 ? ` (${remaining} remaining)` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
