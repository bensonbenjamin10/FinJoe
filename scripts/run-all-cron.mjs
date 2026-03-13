#!/usr/bin/env node
/**
 * Unified cron entry - runs all scheduled jobs.
 * Used by Railway cron service (MODE=cron).
 *
 * Schedule: daily at 00:05 UTC (railway.cron.json)
 * - Recurring expenses: every run (generates draft expenses from templates)
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
  const data = await res.json();
  if (!res.ok) {
    console.error("Recurring expenses error:", data.error || res.statusText);
    hadError = true;
  } else {
    console.log("Recurring expenses OK:", data);
  }
} catch (err) {
  console.error("Recurring expenses failed:", err.message);
  hadError = true;
}

// 2. Weekly insights (Mondays only)
const now = new Date();
if (now.getUTCDay() === 1) {
  console.log("Running weekly insights...");
  try {
    const res = await fetch(`${base}/cron/weekly-insights?secret=${encodeURIComponent(CRON_SECRET)}`);
    const data = await res.json();
    if (!res.ok) {
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
