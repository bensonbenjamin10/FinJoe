import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import morgan from "morgan";
import { requestId } from "./middleware.js";
import { logger } from "./logger.js";
import { registerRoutes } from "./routes.js";
import { setupAuth } from "./auth.js";
import { setupVite, serveStatic } from "./vite.js";
import { handleWebhook } from "../worker/src/webhook.js";
import { runWeeklyInsights } from "../worker/src/weekly-insights.js";
import { runCfoInsightSnapshots } from "./cfo-snapshot-job.js";
import { generateExpensesFromTemplates, generateIncomeFromTemplates } from "../lib/finjoe-data.js";
import { runBackfillEmbeddings } from "../lib/backfill-embeddings.js";
import { db, pool } from "./db.js";
import { deactivateExpiredDemoTenants } from "./lib/demo-expiry.js";
import { logCronRun } from "../lib/cron-logger.js";
import { runBackupToS3, s3BackupConfigured } from "../lib/backup-to-s3.js";
import { expressErrorClientMessage, jsonInternalError } from "./client-safe-error.js";

const app = express();
app.set("trust proxy", 1);

app.use(requestId);
app.use(
  morgan((tokens: any, req: Request, res: Response) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const entry = {
      timestamp: new Date().toISOString(),
      level: "info",
      service: "finjoe-api",
      message: "HTTP request",
      requestId,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      responseTime: tokens["response-time"](req, res),
      ip: tokens["remote-addr"](req, res),
    };
    return JSON.stringify(entry);
  })
);

// Webhook - must be before body parsers to capture raw body for Twilio signature validation
// Handles WhatsApp/Twilio webhook directly (single-project deployment)
app.post(
  "/webhook/finjoe",
  express.urlencoded({
    extended: false,
    verify: (req: Request, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
  async (req: Request, res: Response) => {
    try {
      await handleWebhook(req, res);
    } catch (err) {
      logger.error("Webhook error", { err: String(err), stack: (err as Error).stack });
      if (!res.headersSent) {
        res.status(200).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    }
  }
);

// Health check - cron uses this to verify worker reachability (must return JSON, not HTML)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "finjoe" });
});

// Cron: recurring expenses (same as worker - for single-service deployment)
app.get("/cron/recurring-expenses", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await generateExpensesFromTemplates(db, today, pool);
    res.json({ ok: true, generated: result.generated, errors: result.errors });
  } catch (err) {
    logger.error("Recurring expenses cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run recurring expenses" });
  }
});

// Cron: recurring income (same as worker - for single-service deployment)
app.get("/cron/recurring-income", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await generateIncomeFromTemplates(db, today);
    res.json({ ok: true, generated: result.generated, errors: result.errors });
  } catch (err) {
    logger.error("Recurring income cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run recurring income" });
  }
});

// Cron: backfill embeddings (same as worker - for single-service deployment)
app.get("/cron/backfill-embeddings", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await runBackfillEmbeddings(pool);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("Backfill embeddings cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run backfill embeddings" });
  }
});

// Cron: weekly insights (same as worker - for single-service deployment)
app.get("/cron/weekly-insights", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await runWeeklyInsights();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("Weekly insights cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run weekly insights" });
  }
});

// Cron: persist CFO insight snapshots (weekly; complements WhatsApp weekly-insights)
app.get("/cron/cfo-insight-snapshots", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await runCfoInsightSnapshots();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("CFO insight snapshots cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run CFO insight snapshots" });
  }
});

// Cron: deactivate expired demo tenants (schedule e.g. hourly with CRON_SECRET)
app.get("/cron/demo-expiry", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await deactivateExpiredDemoTenants();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("Demo expiry cron error", { err: String(err) });
    res.status(500).json({ error: "Failed to run demo expiry" });
  }
});

// Cron: pg_dump + optional media tarball → S3 (Railway bucket). Must run on service that has DATABASE_URL + volume.
app.get("/cron/backup", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!s3BackupConfigured()) {
    res.status(503).json({
      error:
        "S3 backup not configured (set AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)",
    });
    return;
  }
  try {
    const result = await logCronRun(db, "backup-to-s3", async () => {
      const r = await runBackupToS3();
      return { ok: true, ...r };
    });
    res.json(result);
  } catch (err) {
    logger.error("Backup cron error", { err: String(err) });
    res.status(500).json(jsonInternalError());
  }
});


app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false }));

await setupAuth(app);
const server = await registerRoutes(app);

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  logger.error("Request error", {
    requestId,
    message: err.message,
    status: err.status || 500,
    stack: err.stack,
  });
  const status = err.status || 500;
  res.status(status).json({ message: expressErrorClientMessage(err) });
});

if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

const port = parseInt(process.env.PORT || "5000", 10);
server.listen(port, "0.0.0.0", () => {
  logger.info("FinJoe serving", { port });
});

const DEMO_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  deactivateExpiredDemoTenants().catch((e) => logger.error("demo expiry interval", { err: String(e) }));
}, DEMO_EXPIRY_INTERVAL_MS);
void deactivateExpiredDemoTenants().catch((e) => logger.error("demo expiry on startup", { err: String(e) }));
