/**
 * Twilio WABA provider implementation.
 * Validates webhooks, sends messages, downloads media using tenant credentials.
 */

import twilio from "twilio";
const { validateIncomingRequest } = twilio;
import { logger } from "../logger.js";
import { downloadTwilioMedia } from "../media.js";
import type { WabaProviderCredentials } from "./types.js";

/** Validate Twilio webhook signature using tenant credentials */
export function validateTwilioWebhook(
  req: { body?: Record<string, string>; originalUrl?: string },
  authToken: string,
  webhookUrl: string
): boolean {
  return !!authToken && validateIncomingRequest(req as any, authToken, { url: webhookUrl });
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
    logger.error("WhatsApp send error", { traceId, to: toNumber, err: String(error) });
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

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: body.toString(),
  }).catch((err) => logger.warn("Typing indicator failed", { traceId, err: String(err) }));
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
