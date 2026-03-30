/**
 * Resolve tenant for incoming webhook helpers.
 */

import { db } from "./db.js";
import { tenants } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { resolveTenantAndProvider } from "./providers/resolver.js";

let cachedDefaultTenantId: string | null = null;

/** Get default tenant id (slug=default). Used when per-tenant provider not configured. */
export async function getDefaultTenantId(): Promise<string> {
  if (cachedDefaultTenantId) return cachedDefaultTenantId;
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "default")).limit(1);
  if (row) {
    cachedDefaultTenantId = row.id;
    return row.id;
  }
  logger.warn("No default tenant found - multi-tenant migration may not have run");
  return "default";
}

/** Resolve tenant from webhook To number — same rules as resolveTenantAndProvider (active row, isActive, Twilio path). */
export async function resolveTenantFromWebhook(toNumber: string): Promise<string> {
  const resolved = await resolveTenantAndProvider(toNumber);
  return resolved.tenantId;
}
