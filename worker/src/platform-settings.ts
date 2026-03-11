/**
 * Platform-level settings (account defaults).
 * Single row, cached. Used when tenant has no override.
 */

import { db } from "./db.js";
import { platformSettings } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

export type PlatformSettingsData = {
  defaultNotificationEmails: string[];
  defaultResendFromEmail: string | null;
  defaultSmsFrom: string | null;
};

let cached: PlatformSettingsData | null = null;

export async function getPlatformSettings(): Promise<PlatformSettingsData> {
  if (cached) return cached;
  try {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, "default"))
      .limit(1);
    const defaultNotificationEmails = (row?.defaultNotificationEmails ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));
    cached = {
      defaultNotificationEmails,
      defaultResendFromEmail: row?.defaultResendFromEmail ?? null,
      defaultSmsFrom: row?.defaultSmsFrom ?? null,
    };
    return cached;
  } catch {
    cached = { defaultNotificationEmails: [], defaultResendFromEmail: null, defaultSmsFrom: null };
    return cached;
  }
}

/** Invalidate cache (e.g. after platform settings update). Call from API if needed. */
export function invalidatePlatformSettingsCache(): void {
  cached = null;
}
