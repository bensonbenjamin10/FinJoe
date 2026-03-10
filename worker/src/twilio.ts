import { logger } from "./logger.js";
import { getCredentialsForTenant } from "./providers/resolver.js";
import {
  sendWhatsApp,
  sendWhatsAppTemplate,
  sendTypingIndicator as providerSendTypingIndicator,
} from "./providers/twilio-provider.js";

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
  tenantId?: string
) {
  const tid = tenantId ?? (await import("./tenant.js").then((m) => m.getDefaultTenantId()));
  const credentials = await getCredentialsForTenant(tid);
  if (!credentials) {
    logger.warn("No WhatsApp credentials for tenant - skipping send", { traceId, tenantId: tid });
    return null;
  }
  return sendWhatsApp(credentials, to, message, traceId);
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
  const tid = tenantId ?? (await import("./tenant.js").then((m) => m.getDefaultTenantId()));
  const credentials = await getCredentialsForTenant(tid);
  if (!credentials) {
    logger.warn("No WhatsApp credentials for tenant - skipping template send", { traceId, tenantId: tid });
    return null;
  }
  return sendWhatsAppTemplate(credentials, to, templateSid, contentVariables, traceId);
}
