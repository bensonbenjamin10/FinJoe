#!/usr/bin/env node
/**
 * Unified cron entry - runs all scheduled jobs.
 * Used by Railway cron service (MODE=cron).
 *
 * Schedule: daily at 00:05 UTC (railway.cron.json)
 * - Recurring expenses: every run (generates draft expenses from templates)
 * - Backfill embeddings: every run (processes expenses where embedding IS NULL for RAG)
 * - Weekly insights: only on Mondays (sends expense/income summary to admin/finance)
 */

import "dotenv/config";

const WORKER_URL = process.env.FINJOE_WORKER_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "http://localhost:5001";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("CRON_SECRET must be set");
  process.exit(1);
}

const base = WORKER_URL.replace(/\/$/, "");
let hadError = false;

// 1. Recurring expenses (daily)
console.log("Running recurring expenses...");
try {
  const res = await fetch(`${base}/cron/recurring-expenses?secret=${encodeURIComponent(CRON_SECRET)}`);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
  if (!res.ok || data.error) {
    console.error("Recurring expenses error:", data.error || res.statusText);
    hadError = true;
  } else {
    console.log("Recurring expenses OK:", data);
  }
} catch (err) {
  console.error("Recurring expenses failed:", err.message);
  hadError = true;
}

// 2. Backfill embeddings (daily - processes expenses without embeddings for RAG)
console.log("Running backfill embeddings...");
try {
  const res = await fetch(`${base}/cron/backfill-embeddings?secret=${encodeURIComponent(CRON_SECRET)}`);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
  if (!res.ok || data.error) {
    console.error("Backfill embeddings error:", data.error || res.statusText);
    hadError = true;
  } else {
    if (data.skipped) {
      console.log("Backfill embeddings skipped (no GEMINI_API_KEY or no expenses to process)");
    } else if (data.processed > 0) {
      console.log("Backfill embeddings OK:", { processed: data.processed, errors: data.errors, total: data.total });
    } else {
      console.log("Backfill embeddings OK (none needed)");
    }
  }
} catch (err) {
  console.error("Backfill embeddings failed:", err.message);
  hadError = true;
}

// 3. Weekly insights (Mondays only)
const now = new Date();
if (now.getUTCDay() === 1) {
  console.log("Running weekly insights...");
  try {
    const res = await fetch(`${base}/cron/weekly-insights?secret=${encodeURIComponent(CRON_SECRET)}`);
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
    if (!res.ok || data.error) {
      console.error("Weekly insights error:", data.error || res.statusText);
      hadError = true;
    } else {
      console.log("Weekly insights OK:", data);
    }
  } catch (err) {
    console.error("Weekly insights failed:", err.message);
    hadError = true;
  }
} else {
  console.log("Skipping weekly insights (not Monday)");
}

process.exit(hadError ? 1 : 0);
