/**
 * Resend email provider for FinJoe notifications.
 * Uses RESEND_API_KEY and RESEND_FROM from env.
 */

import { Resend } from "resend";
import { logger } from "../logger.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const defaultFrom = process.env.RESEND_FROM || "FinJoe <onboarding@resend.dev>";

export interface ResendSendOptions {
  from?: string;
  idempotencyKey?: string;
}

/**
 * Send email via Resend.
 * Returns { id } on success, null if Resend not configured or on error.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options?: ResendSendOptions,
  traceId?: string
): Promise<{ id: string } | null> {
  if (!resend) {
    logger.warn("Resend not configured - RESEND_API_KEY missing", { traceId });
    return null;
  }

  const recipients = Array.isArray(to) ? to : [to];
  const from = options?.from || defaultFrom;

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject,
    html,
    idempotencyKey: options?.idempotencyKey,
  });

  if (error) {
    logger.error("Resend email send error", { traceId, to: recipients, err: error.message });
    return null;
  }

  logger.info("Email sent via Resend", { traceId, to: recipients, id: data?.id });
  return data ? { id: data.id } : null;
}
