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
import { generateExpensesFromTemplates, generateIncomeFromTemplates } from "../lib/finjoe-data.js";
import { runBackfillEmbeddings } from "../lib/backfill-embeddings.js";
import { db, pool } from "./db.js";

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

app.use(express.json());
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
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
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
