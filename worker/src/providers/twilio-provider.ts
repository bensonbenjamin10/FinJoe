/**
 * Twilio WABA provider implementation.
 * Validates webhooks, sends messages, downloads media using tenant credentials.
 */

import twilio from "twilio";
const { validateIncomingRequest } = twilio;
import { logger, serializeError } from "../logger.js";
import { downloadTwilioMedia } from "../media.js";
import type { WabaProviderCredentials } from "./types.js";

/** Validate Twilio webhook signature using tenant credentials */
export function validateTwilioWebhook(
  req: { body?: Record<string, string>; originalUrl?: string; headers?: Record<string, unknown>; header?: (name: string) => string | undefined },
  authToken: string,
  webhookUrl: string
): boolean {
  if (!authToken) {
    logger.warn("Twilio webhook validation skipped: no authToken");
    return false;
  }
  const signature = req.header?.("X-Twilio-Signature") ?? (req.headers?.["x-twilio-signature"] as string | undefined);
  if (!signature) {
    logger.warn("Twilio webhook validation failed: missing X-Twilio-Signature header");
    return false;
  }
  const result = validateIncomingRequest(req as any, authToken, { url: webhookUrl });
  if (!result) {
    logger.warn("Twilio webhook signature mismatch", {
      webhookUrl,
      hasSignature: !!signature,
      signaturePreview: signature ? `${signature.slice(0, 8)}...` : null,
      authTokenLen: authToken.length,
      bodyKeys: req.body ? Object.keys(req.body).sort().join(",") : "none",
    });
  }
  return result;
}

/** Create Twilio client from credentials */
export function createTwilioClient(credentials: WabaProviderCredentials) {
  const { accountSid, authToken } = credentials.config;
  return twilio(accountSid, authToken);
}

/** Send free-form WhatsApp message */
export async function sendWhatsApp(
  credentials: WabaProviderCredentials,
  to: string,
  message: string,
  traceId?: string
) {
  const client = createTwilioClient(credentials);
  const from = credentials.whatsappFrom.startsWith("whatsapp:") ? credentials.whatsappFrom : `whatsapp:${credentials.whatsappFrom}`;
  const toNumber = formatForWhatsApp(to);

  try {
    const result = await client.messages.create({
      from,
      to: toNumber,
      body: message,
    });
    logger.info("WhatsApp message sent", { traceId, to: toNumber, sid: result.sid });
    return result;
  } catch (error) {
    const e = error as { code?: string | number; status?: number; message?: string };
    logger.error("WhatsApp send error", {
      traceId,
      to: toNumber,
      err: String(error),
      code: e?.code,
      status: e?.status,
      message: e?.message,
    });
    throw error;
  }
}

/** Send WhatsApp template message */
export async function sendWhatsAppTemplate(
  credentials: WabaProviderCredentials,
  to: string,
  templateSid: string,
  contentVariables: Record<string, string>,
  traceId?: string
) {
  if (!templateSid) {
    logger.warn("Template SID not provided", { traceId });
    return null;
  }

  const client = createTwilioClient(credentials);
  const from = credentials.whatsappFrom.startsWith("whatsapp:") ? credentials.whatsappFrom : `whatsapp:${credentials.whatsappFrom}`;
  const toNumber = formatForWhatsApp(to);

  try {
    const result = await client.messages.create({
      from,
      to: toNumber,
      contentSid: templateSid,
      contentVariables: JSON.stringify(contentVariables),
    });
    logger.info("WhatsApp template sent", { traceId, to: toNumber, sid: result.sid });
    return result;
  } catch (error) {
    logger.error("WhatsApp template send error", { traceId, to: toNumber, err: String(error) });
    throw error;
  }
}

/** Send typing indicator (Twilio Public Beta) */
export function sendTypingIndicator(
  credentials: WabaProviderCredentials,
  messageSid: string,
  traceId?: string
): void {
  const { accountSid, authToken } = credentials.config;
  if (!messageSid?.startsWith("SM")) return;

  const url = "https://messaging.twilio.com/v2/Indicators/Typing.json";
  const body = new URLSearchParams({ messageId: messageSid, channel: "whatsapp" });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: body.toString(),
  })
    .finally(() => clearTimeout(timeoutId))
    .catch((err) => logger.warn("Typing indicator failed", { traceId, ...serializeError(err) }));
}

/** Download media from Twilio MediaUrl */
export async function downloadMedia(
  credentials: WabaProviderCredentials,
  mediaUrl: string,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const { accountSid, authToken } = credentials.config;
  return downloadTwilioMedia(mediaUrl, contentType, accountSid, authToken);
}

/** Format phone for Twilio WhatsApp API */
function formatForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.substring(2);
  }
  return `whatsapp:+91${digits}`;
}

/** Format phone for Twilio SMS API (no whatsapp: prefix) */
export function formatForSms(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.substring(2);
  }
  return `+91${digits}`;
}

/** Send SMS message (fallback when outside WhatsApp 24h window) */
export async function sendSms(
  credentials: WabaProviderCredentials,
  to: string,
  body: string,
  traceId?: string
) {
  const client = createTwilioClient(credentials);
  const toNumber = formatForSms(to);
  const from = credentials.smsFrom;

  try {
    const result = await client.messages.create({
      from,
      to: toNumber,
      body,
    });
    logger.info("SMS sent", { traceId, to: toNumber, sid: result.sid });
    return result;
  } catch (error) {
    logger.error("SMS send error", { traceId, to: toNumber, err: String(error) });
    throw error;
  }
}
