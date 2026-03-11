/**
 * FinJoe email sending via Resend.
 * Resolves tenant settings for from address override, then platform default, then env.
 */

import { sendEmail } from "./providers/resend-provider.js";
import { db } from "./db.js";
import { finjoeSettings } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getPlatformSettings } from "./platform-settings.js";

/** Send email to recipients. Uses tenant resendFromEmail → platform default → RESEND_FROM env. */
export async function sendFinJoeEmail(
  to: string[],
  subject: string,
  html: string,
  options?: { tenantId?: string; from?: string; idempotencyKey?: string },
  traceId?: string
): Promise<boolean> {
  const recipients = to.filter((e) => e && e.includes("@"));
  if (recipients.length === 0) {
    logger.warn("No valid email recipients", { traceId, to });
    return false;
  }

  let fromOverride: string | undefined = options?.from;
  if (!fromOverride && options?.tenantId) {
    const [row] = await db
      .select({ resendFromEmail: finjoeSettings.resendFromEmail })
      .from(finjoeSettings)
      .where(eq(finjoeSettings.tenantId, options.tenantId))
      .limit(1);
    if (row?.resendFromEmail) fromOverride = row.resendFromEmail;
  }
  if (!fromOverride) {
    const platform = await getPlatformSettings();
    if (platform.defaultResendFromEmail) fromOverride = platform.defaultResendFromEmail;
  }

  const result = await sendEmail(
    recipients,
    subject,
    html,
    { from: fromOverride, idempotencyKey: options?.idempotencyKey },
    traceId
  );
  return !!result;
}
