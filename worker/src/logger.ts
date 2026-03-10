/**
 * Structured logger for FinJoe worker - JSON format for Railway/log aggregation.
 * Use traceId (e.g. messageSid) to correlate logs across the request flow.
 */
type LogLevel = "info" | "warn" | "error";

interface LogContext {
  traceId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, msg: string, ctx?: LogContext) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "finjoe",
    message: msg,
    ...ctx,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};
