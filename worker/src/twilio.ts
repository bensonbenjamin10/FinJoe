import { logger } from "./logger.js";
import { getCredentialsForTenant } from "./providers/resolver.js";
import {
  sendWhatsApp,
  sendWhatsAppTemplate,
  sendSms,
  sendTypingIndicator as providerSendTypingIndicator,
} from "./providers/twilio-provider.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WHATSAPP_CHAR_LIMIT = 1500; // Twilio rejects at 1600; leave buffer

/**
 * Split a long message into chunks that fit within WhatsApp's character limit.
 * Tries to break at paragraph boundaries, then line boundaries, then sentence
 * boundaries, then word boundaries—never mid-word.
 */
export function splitMessage(text: string, limit = WHATSAPP_CHAR_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let breakIdx = -1;

    // 1) Try paragraph break (double newline)
    const paraSearch = remaining.lastIndexOf("\n\n", limit);
    if (paraSearch > 0) {
      breakIdx = paraSearch;
    }

    // 2) Try single newline
    if (breakIdx <= 0) {
      const lineSearch = remaining.lastIndexOf("\n", limit);
      if (lineSearch > 0) breakIdx = lineSearch;
    }

    // 3) Try sentence boundary (. ! ? followed by space or end)
    if (breakIdx <= 0) {
      for (let i = limit; i > 0; i--) {
        if (".!?".includes(remaining[i - 1]) && (i >= remaining.length || /\s/.test(remaining[i]))) {
          breakIdx = i;
          break;
        }
      }
    }

    // 4) Try word boundary (space)
    if (breakIdx <= 0) {
      const spaceSearch = remaining.lastIndexOf(" ", limit);
      if (spaceSearch > 0) breakIdx = spaceSearch;
    }

    // 5) Hard cut (shouldn't happen with real text)
    if (breakIdx <= 0) breakIdx = limit;

    chunks.push(remaining.slice(0, breakIdx).trimEnd());
    remaining = remaining.slice(breakIdx).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Normalize any phone number to E.164 format for storage (e.g. "+919876543210", "+12125551234").
 * Accepts: Twilio "whatsapp:+..." prefix, leading zeros, with/without country code.
 * For bare 10-digit numbers (no country code prefix), assumes India (+91).
 */
export function normalizePhone(from: string): string {
  // Strip Twilio prefix and all non-digit/non-plus characters except a leading +
  let raw = from.replace(/^whatsapp:/i, "").trim();
  // If it already looks like valid E.164, return it as-is
  if (/^\+\d{7,15}$/.test(raw)) return raw;
  // Remove non-digits
  let digits = raw.replace(/\D/g, "");
  // Strip leading zeros (e.g. 0091... → 91...)
  while (digits.startsWith("0") && digits.length > 10) digits = digits.substring(1);
  // 10-digit bare number → assume India
  if (digits.length === 10) return `+91${digits}`;
  // Already has a country code (length > 10)
  return `+${digits}`;
}

/** Format a stored E.164 phone number for the Twilio WhatsApp API */
export function formatForWhatsApp(phone: string): string {
  const e164 = normalizePhone(phone);
  return `whatsapp:${e164}`;
}

/** Twilio error codes that are permanent and should not be retried */
function isPermanentTwilioError(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 21617; // message body exceeds 1600 character limit
}

/** Send free-form WhatsApp message. Uses tenant credentials from DB or env.
 *  Automatically splits messages that exceed WhatsApp's 1600-char limit. */
export async function sendFinJoeWhatsApp(
  to: string,
  message: string,
  traceId?: string,
  tenantId?: string,
  options?: { maxAttempts?: number }
) {
  const tid: string = tenantId ?? (await import("./tenant.js").then((m) => m.getDefaultTenantId()));
  const credentials = await getCredentialsForTenant(tid);
  if (!credentials) {
    logger.warn("No WhatsApp credentials for tenant - skipping send", { traceId, tenantId: tid });
    return null;
  }

  const toLast4 = String(to).replace(/\D/g, "").slice(-4) || "****";
  const chunks = splitMessage(message);
  if (chunks.length > 1) {
    logger.info("Splitting long WhatsApp message", { traceId, tenantId: tid, toLast4, totalLength: message.length, chunks: chunks.length });
  }

  const maxAttempts = Math.min(4, Math.max(1, options?.maxAttempts ?? 3));
  let lastResult: Awaited<ReturnType<typeof sendWhatsApp>> | null = null;

  for (const chunk of chunks) {
    let attempt = 0;
    let lastErr: unknown;
    let sent = false;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        lastResult = await sendWhatsApp(credentials, to, chunk, traceId);
        sent = true;
        break;
      } catch (err) {
        lastErr = err;
        logger.warn("WhatsApp send attempt failed", {
          traceId,
          tenantId: tid,
          toLast4,
          attempt,
          maxAttempts,
          err: String(err),
        });
        if (isPermanentTwilioError(err)) {
          logger.error("Permanent Twilio error - not retrying", { traceId, tenantId: tid, toLast4, err: String(err) });
          break;
        }
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
        }
      }
    }
    if (!sent) {
      logger.error("WhatsApp send exhausted retries", { traceId, tenantId: tid, toLast4, maxAttempts, err: String(lastErr) });
      throw lastErr;
    }
    if (chunks.length > 1) {
      await sleep(300);
    }
  }
  return lastResult;
}

/** Send WhatsApp typing indicator. Pass credentials when available (e.g. from webhook), else tenantId. */
export function sendTypingIndicator(
  messageSid: string,
  traceId?: string,
  options?: { credentials?: import("./providers/types.js").WabaProviderCredentials; tenantId?: string }
): void {
  if (options?.credentials) {
    providerSendTypingIndicator(options.credentials, messageSid, traceId);
    return;
  }
  const tid = options?.tenantId;
  import("./tenant.js")
    .then((m) => m.getDefaultTenantId())
    .then(async (defaultId) => {
      const credentials = await getCredentialsForTenant(tid ?? defaultId);
      if (credentials) providerSendTypingIndicator(credentials, messageSid, traceId);
    })
    .catch(() => {});
}

/** Send WhatsApp template message. Uses tenant credentials. */
export async function sendFinJoeWhatsAppTemplate(
  to: string,
  templateSid: string,
  contentVariables: Record<string, string>,
  traceId?: string,
  tenantId?: string
) {
  const tid: string = tenantId ?? (await import("./tenant.js").then((m) => m.getDefaultTenantId()));
  const credentials = await getCredentialsForTenant(tid);
  if (!credentials) {
    logger.warn("No WhatsApp credentials for tenant - skipping template send", { traceId, tenantId: tid });
    return null;
  }
  return sendWhatsAppTemplate(credentials, to, templateSid, contentVariables, traceId);
}

/** Send SMS message. Uses tenant credentials. Fallback when outside WhatsApp 24h window. */
export async function sendFinJoeSms(
  to: string,
  message: string,
  traceId?: string,
  tenantId?: string
) {
  const tid: string = tenantId ?? (await import("./tenant.js").then((m) => m.getDefaultTenantId()));
  const credentials = await getCredentialsForTenant(tid);
  if (!credentials) {
    logger.warn("No Twilio credentials for tenant - skipping SMS send", { traceId, tenantId: tid });
    return null;
  }
  return sendSms(credentials, to, message, traceId);
}
