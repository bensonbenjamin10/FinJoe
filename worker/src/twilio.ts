import twilio from "twilio";
import { logger } from "./logger.js";

const FINJOE_FROM = process.env.TWILIO_FINJOE_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_FROM;

let client: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !FINJOE_FROM) {
      logger.warn("Twilio credentials not configured - FinJoe WhatsApp will be skipped");
      return null;
    }
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
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

export async function sendFinJoeWhatsApp(to: string, message: string, traceId?: string) {
  const twilioClient = getTwilioClient();
  if (!twilioClient || !FINJOE_FROM) return null;

  const from = FINJOE_FROM.startsWith("whatsapp:") ? FINJOE_FROM : `whatsapp:${FINJOE_FROM}`;
  const toNumber = formatForWhatsApp(to);

  try {
    const result = await twilioClient.messages.create({
      from,
      to: toNumber,
      body: message,
    });
    logger.info("WhatsApp message sent", { traceId, to: toNumber, sid: result.sid });
    return result;
  } catch (error) {
    logger.error("FinJoe WhatsApp send error", { traceId, to: toNumber, err: String(error) });
    throw error;
  }
}

/** Send WhatsApp typing indicator (Twilio Public Beta). Fire-and-forget; do not await. */
export function sendTypingIndicator(messageSid: string, traceId?: string): void {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || !messageSid?.startsWith("SM")) return;

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

/** Send WhatsApp template message (for use outside 24h window when free-form is not allowed) */
export async function sendFinJoeWhatsAppTemplate(
  to: string,
  templateSid: string,
  contentVariables: Record<string, string>,
  traceId?: string
) {
  if (!templateSid) {
    logger.warn("Template SID not provided - skipping FinJoe WhatsApp template", { traceId });
    return null;
  }

  const twilioClient = getTwilioClient();
  if (!twilioClient || !FINJOE_FROM) return null;

  const from = FINJOE_FROM.startsWith("whatsapp:") ? FINJOE_FROM : `whatsapp:${FINJOE_FROM}`;
  const toNumber = formatForWhatsApp(to);

  try {
    const result = await twilioClient.messages.create({
      from,
      to: toNumber,
      contentSid: templateSid,
      contentVariables: JSON.stringify(contentVariables),
    });
    logger.info("FinJoe WhatsApp template sent", { traceId, to: toNumber, sid: result.sid });
    return result;
  } catch (error) {
    logger.error("FinJoe WhatsApp template send error", { traceId, to: toNumber, err: String(error) });
    throw error;
  }
}
