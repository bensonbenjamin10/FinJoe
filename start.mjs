#!/usr/bin/env node
/**
 * Single entry point - mode selected via MODE env var.
 * MODE=cron  → run all cron jobs (recurring expenses daily, weekly insights on Mondays)
 * MODE=server or unset → run main Express server
 */

// Railway: prefer IPv4 for outbound fetch (Gemini, Twilio) – avoids ENETUNREACH when IPv6 fails
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

if (process.env.MODE === "cron") {
  await import("./scripts/run-all-cron.mjs");
} else {
  await import("./dist/index.js");
}
