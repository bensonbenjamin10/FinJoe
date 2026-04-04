#!/usr/bin/env node
/**
 * Unified cron entry - runs all scheduled jobs.
 * Used by Railway cron service (MODE=cron).
 *
 * Schedule: daily at 00:05 UTC (railway.cron.json)
 * - Recurring expenses: every run (generates draft expenses from templates)
 * - Backfill embeddings: every run (processes expenses where embedding IS NULL for RAG)
 * - Weekly insights: only on Mondays (sends expense/income summary to admin/finance)
 * - S3 backup: if FINJOE_APP_URL or PUBLIC_APP_URL is set, calls main app GET /cron/backup (volume + pg_dump live there)
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

function formatError(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return (
      "Received HTML instead of JSON. You may be hitting the frontend (e.g. finjoe.app) instead of the worker. " +
      "Set FINJOE_WORKER_URL to your worker's Railway URL (e.g. https://finjoe-worker-xxx.up.railway.app)."
    );
  }
  return trimmed || "Unknown error";
}

// Log resolved worker URL for debugging (no secrets)
console.log("Worker URL:", base);
console.log("Checking worker reachability...");
try {
  const healthRes = await fetch(`${base}/health`);
  const healthText = await healthRes.text();
  if (healthText.trim().startsWith("<!DOCTYPE") || healthText.trim().startsWith("<html")) {
    console.error(formatError(healthText));
    process.exit(1);
  }
  if (!healthRes.ok) {
    console.error("Worker health check failed:", healthRes.status, healthRes.statusText);
    process.exit(1);
  }
  let health = {};
  try {
    health = JSON.parse(healthText);
  } catch (_) {
    /* ignore */
  }
  if (health?.status !== "ok") {
    // Accept 200 even if body is empty/non-JSON (proxy, cold start). Cron calls will fail with 401 if wrong.
    console.log("Worker reachable (status:", health?.status ?? "unknown", ")");
  } else {
    console.log("Worker OK");
  }
} catch (err) {
  console.error("Cannot reach worker at", base, "-", err.message);
  process.exit(1);
}

// 1. Recurring expenses (daily)
console.log("Running recurring expenses...");
try {
  const res = await fetch(`${base}/cron/recurring-expenses?secret=${encodeURIComponent(CRON_SECRET)}`);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
  if (!res.ok || data.error) {
    console.error("Recurring expenses error:", formatError(data.error || res.statusText));
    hadError = true;
  } else {
    console.log("Recurring expenses OK:", data);
  }
} catch (err) {
  console.error("Recurring expenses failed:", err.message);
  hadError = true;
}

// 2. Recurring income (daily)
console.log("Running recurring income...");
try {
  const res = await fetch(`${base}/cron/recurring-income?secret=${encodeURIComponent(CRON_SECRET)}`);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
  if (!res.ok || data.error) {
    console.error("Recurring income error:", formatError(data.error || res.statusText));
    hadError = true;
  } else {
    console.log("Recurring income OK:", data);
  }
} catch (err) {
  console.error("Recurring income failed:", err.message);
  hadError = true;
}

// 3. Backfill embeddings (daily - processes expenses without embeddings for RAG)
console.log("Running backfill embeddings...");
try {
  const res = await fetch(`${base}/cron/backfill-embeddings?secret=${encodeURIComponent(CRON_SECRET)}`);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
  if (!res.ok || data.error) {
    console.error("Backfill embeddings error:", formatError(data.error || res.statusText));
    hadError = true;
  } else {
    if (data.skipped) {
      console.log("Backfill embeddings skipped (no GEMINI_API_KEY or no expenses to process)");
    } else if (data.processed > 0) {
      console.log("Backfill embeddings OK:", { processed: data.processed, errors: data.errors, total: data.total, ...(data.remaining != null && { remaining: data.remaining }) });
    } else {
      console.log("Backfill embeddings OK (none needed)");
    }
  }
} catch (err) {
  console.error("Backfill embeddings failed:", err.message);
  hadError = true;
}

// 4. Weekly insights (Mondays only)
const now = new Date();
if (now.getUTCDay() === 1) {
  console.log("Running weekly insights...");
  try {
    const res = await fetch(`${base}/cron/weekly-insights?secret=${encodeURIComponent(CRON_SECRET)}`);
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
    if (!res.ok || data.error) {
      console.error("Weekly insights error:", formatError(data.error || res.statusText));
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

// 5. S3 backup (DB + optional media) — must hit main FinJoe URL (volume + pg_dump live there), not worker
const APP_URL = process.env.FINJOE_APP_URL || process.env.PUBLIC_APP_URL;
if (APP_URL) {
  const appBase = APP_URL.replace(/\/$/, "");
  console.log("Running S3 backup via main app:", appBase);
  try {
    const res = await fetch(`${appBase}/cron/backup?secret=${encodeURIComponent(CRON_SECRET)}`);
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() || res.statusText };
    if (!res.ok || data.error) {
      console.error("S3 backup error:", formatError(data.error || res.statusText));
      hadError = true;
    } else {
      console.log("S3 backup OK:", data);
    }
  } catch (err) {
    console.error("S3 backup failed:", err.message);
    hadError = true;
  }
} else {
  console.log("Skipping S3 backup (set FINJOE_APP_URL or PUBLIC_APP_URL to your main FinJoe HTTPS URL, e.g. https://finjoe.app)");
}

process.exit(hadError ? 1 : 0);
