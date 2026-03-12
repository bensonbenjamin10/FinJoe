#!/usr/bin/env node
/**
 * Single entry point - mode selected via MODE env var.
 * MODE=cron  → run weekly insights script (exits when done)
 * MODE=server or unset → run main Express server
 */

if (process.env.MODE === "cron") {
  await import("./scripts/run-weekly-insights.mjs");
} else {
  await import("./dist/index.js");
}
