/**
 * Resolve tenant for incoming webhook.
 * Phase 5 will resolve from tenant_waba_providers by To number.
 * For now, use default tenant.
 */

import { db } from "./db.js";
import { tenants, tenantWabaProviders } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

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

/** Resolve tenant from webhook. To = number that received the message (e.g. whatsapp:+14155238886). Returns tenant id. */
export async function resolveTenantFromWebhook(toNumber: string): Promise<string> {
  const toNorm = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;
  const [provider] = await db
    .select({ tenantId: tenantWabaProviders.tenantId })
    .from(tenantWabaProviders)
    .where(eq(tenantWabaProviders.whatsappFrom, toNorm))
    .limit(1);
  if (provider) return provider.tenantId;
  return getDefaultTenantId();
}
