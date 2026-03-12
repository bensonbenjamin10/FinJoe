#!/usr/bin/env node
/**
 * Run weekly insights cron manually or via system cron.
 * Usage: node scripts/run-weekly-insights.mjs
 * Or with curl: curl "https://your-worker-url/cron/weekly-insights?secret=YOUR_CRON_SECRET"
 *
 * For system cron (e.g. every Monday 9am):
 * 0 9 * * 1 curl -s "https://your-worker-url/cron/weekly-insights?secret=$CRON_SECRET"
 */

import "dotenv/config";

const WORKER_URL = process.env.FINJOE_WORKER_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "http://localhost:5001";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("CRON_SECRET must be set in .env");
  process.exit(1);
}

const url = `${WORKER_URL.replace(/\/$/, "")}/cron/weekly-insights?secret=${encodeURIComponent(CRON_SECRET)}`;
console.log("Calling weekly insights:", url.replace(CRON_SECRET, "***"));

try {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    console.error("Error:", data.error || res.statusText);
    process.exit(1);
  }
  console.log("OK:", data);
} catch (err) {
  console.error("Request failed:", err.message);
  process.exit(1);
}
