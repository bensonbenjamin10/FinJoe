import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../db.js";
import { tenants } from "../../shared/schema.js";
import { logger } from "../logger.js";

/** Deactivate demo tenants past demo_expires_at (cron). */
export async function deactivateExpiredDemoTenants(): Promise<{ deactivated: number }> {
  const now = new Date();
  const result = await db
    .update(tenants)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(tenants.isDemo, true),
        eq(tenants.isActive, true),
        isNotNull(tenants.demoExpiresAt),
        lte(tenants.demoExpiresAt, now),
      ),
    )
    .returning({ id: tenants.id });
  const n = result.length;
  if (n > 0) {
    logger.info("deactivateExpiredDemoTenants", { count: n });
  }
  return { deactivated: n };
}
