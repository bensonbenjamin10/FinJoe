#!/usr/bin/env node
/**
 * Run recurring expense generation cron manually or via system cron.
 * Usage: node scripts/run-recurring-expenses.mjs
 * Or with curl: curl "https://your-worker-url/cron/recurring-expenses?secret=YOUR_CRON_SECRET"
 *
 * For system cron (e.g. daily at 00:05 UTC):
 * 5 0 * * * curl -s "https://your-worker-url/cron/recurring-expenses?secret=$CRON_SECRET"
 */

import "dotenv/config";

const WORKER_URL = process.env.FINJOE_WORKER_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "http://localhost:5001";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("CRON_SECRET must be set in .env");
  process.exit(1);
}

const url = `${WORKER_URL.replace(/\/$/, "")}/cron/recurring-expenses?secret=${encodeURIComponent(CRON_SECRET)}`;
console.log("Calling recurring expenses:", url.replace(CRON_SECRET, "***"));

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
