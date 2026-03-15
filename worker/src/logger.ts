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

/** Serialize error for logging: includes message, cause, code (e.g. ECONNREFUSED), and stack */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err == null) return { err: null };
  const e = err as Error & { cause?: unknown; code?: string };
  const out: Record<string, unknown> = {
    err: String(err),
    message: e.message,
    ...(e.code && { code: e.code }),
    ...(e.stack && { stack: e.stack }),
  };
  if (e.cause != null) {
    out.cause = e.cause instanceof Error
      ? { message: e.cause.message, code: (e.cause as Error & { code?: string }).code }
      : String(e.cause);
  }
  return out;
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};
