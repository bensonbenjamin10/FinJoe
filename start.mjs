#!/usr/bin/env node
/**
 * Single entry point - mode selected via MODE env var.
 * MODE=cron  → run all cron jobs (recurring expenses daily, weekly insights on Mondays)
 * MODE=server or unset → run main Express server
 */

// Railway: prefer IPv4 for outbound fetch (Gemini, Twilio) – avoids ENETUNREACH when IPv6 fails
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

// Railway: increase connect timeout – default 10s causes UND_ERR_CONNECT_TIMEOUT to Google/Twilio APIs
import { setGlobalDispatcher, Agent } from "undici";
setGlobalDispatcher(new Agent({ connectTimeout: 30_000 }));

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const skipMigrate = process.env.RUN_MIGRATIONS_ON_START === "false";
if (!skipMigrate && process.env.DATABASE_URL) {
  const migrateScript = path.join(__dirname, "scripts", "run-migrations.mjs");
  const result = spawnSync(process.execPath, [migrateScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  if (result.status !== 0) {
    console.error(
      "Database migrations failed. Fix the error above or set RUN_MIGRATIONS_ON_START=false only if migrations are applied elsewhere.",
    );
    process.exit(result.status ?? 1);
  }
}

if (process.env.MODE === "cron") {
  await import("./scripts/run-all-cron.mjs");
} else {
  await import("./dist/index.js");
}
