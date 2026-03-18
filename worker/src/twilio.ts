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

/** Normalize phone to 12 digits (91 + 10 digits) for storage */
export function normalizePhone(from: string): string {
  let digits = from.replace(/\D/g, "");
  while (digits.startsWith("0") && digits.length > 10) digits = digits.substring(1);
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.substring(2);
  }
  return "91" + digits;
}

/** Format phone for Twilio WhatsApp API */
export function formatForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.substring(2);
  }
  return `whatsapp:+91${digits}`;
}

/** Send free-form WhatsApp message. Uses tenant credentials from DB or env. */
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
  const maxAttempts = Math.min(4, Math.max(1, options?.maxAttempts ?? 3));
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await sendWhatsApp(credentials, to, message, traceId);
    } catch (err) {
      lastErr = err;
      logger.warn("WhatsApp send attempt failed", { traceId, tenantId: tid, to, attempt, maxAttempts, err: String(err) });
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
  }
  logger.error("WhatsApp send exhausted retries", { traceId, tenantId: tid, to, maxAttempts, err: String(lastErr) });
  throw lastErr;
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
