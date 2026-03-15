// Railway: prefer IPv4 for outbound fetch (Gemini, Twilio) – avoids "fetch failed" when IPv6 fails
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

// Railway: increase connect timeout – default 10s causes UND_ERR_CONNECT_TIMEOUT to Google/Twilio APIs
import { setGlobalDispatcher, Agent } from "undici";
setGlobalDispatcher(new Agent({ connectTimeout: 30_000 }));

import "dotenv/config";
import express from "express";
import { handleWebhook } from "./webhook.js";
import { runWeeklyInsights } from "./weekly-insights.js";
import { generateExpensesFromTemplates, generateIncomeFromTemplates } from "../../lib/finjoe-data.js";
import { runBackfillEmbeddings } from "../../lib/backfill-embeddings.js";
import { db, pool } from "./db.js";
import { logger } from "./logger.js";
import { logCronRun } from "../../lib/cron-logger.js";

// Prevent unhandled rejections from crashing the process (can cause 502)
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});

const app = express();

// Trust proxy - required for correct protocol/host when behind Railway/load balancer
app.set("trust proxy", 1);

// Twilio sends application/x-www-form-urlencoded - capture raw body for signature validation
app.use(
  express.urlencoded({
    extended: false,
    verify: (req: express.Request, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "finjoe" });
});

app.get("/cron/weekly-insights", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await logCronRun(db, "weekly-insights", async () => {
      const r = await runWeeklyInsights();
      return { ok: true, ...r };
    });
    res.json(result);
  } catch (err) {
    logger.error("Weekly insights cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run weekly insights" });
  }
});

app.get("/cron/recurring-expenses", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await logCronRun(db, "recurring-expenses", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const r = await generateExpensesFromTemplates(db, today, pool);
      return { ok: true, generated: r.generated, errors: r.errors };
    });
    res.json(result);
  } catch (err) {
    logger.error("Recurring expenses cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run recurring expenses" });
  }
});

app.get("/cron/recurring-income", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await logCronRun(db, "recurring-income", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const r = await generateIncomeFromTemplates(db, today);
      return { ok: true, generated: r.generated, errors: r.errors };
    });
    res.json(result);
  } catch (err) {
    logger.error("Recurring income cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run recurring income" });
  }
});

app.get("/cron/backfill-embeddings", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await logCronRun(db, "backfill-embeddings", async () => {
      const r = await runBackfillEmbeddings(pool);
      return { ok: true, ...r };
    });
    res.json(result);
  } catch (err) {
    logger.error("Backfill embeddings cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run backfill embeddings" });
  }
});

// Wrap async handler so Express catches rejections (prevents 502 from unhandled errors)
app.post("/webhook/finjoe", (req, res, next) => {
  handleWebhook(req, res).catch(next);
});

// Global error handler - ensures we always respond (prevents Envoy 502 from unhandled errors)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled webhook error", { err: String(err), stack: err.stack });
  if (!res.headersSent) {
    // Return 200 + empty TwiML so Twilio gets valid response (avoids retries, prevents 502)
    res.status(200).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

const port = parseInt(process.env.PORT || "5001", 10);
app.listen(port, () => {
  logger.info("FinJoe worker started", { port });
  // Run embeddings backfill on startup (non-blocking): processes expenses where embedding IS NULL
  runBackfillEmbeddings(pool)
    .then((r) => {
      if (r.skipped) return;
      if (r.processed > 0) logger.info("Startup backfill embeddings", { processed: r.processed, errors: r.errors, total: r.total });
    })
    .catch((err) => logger.error("Startup backfill embeddings failed", { err: String(err) }));
});
