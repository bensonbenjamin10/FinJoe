import "dotenv/config";
import express from "express";
import { handleWebhook } from "./webhook.js";
import { logger } from "./logger.js";

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
});
