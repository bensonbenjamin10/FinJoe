/**
 * Resolve tenant and provider credentials from webhook To number.
 * Falls back to default tenant + env vars when no tenant_waba_providers row exists.
 */

import { db } from "../db.js";
import { tenants, tenantWabaProviders } from "../../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";
import type { TenantProviderResult, TwilioProviderConfig, WabaProviderCredentials } from "./types.js";

let cachedDefaultTenantId: string | null = null;

async function getDefaultTenantId(): Promise<string> {
  if (cachedDefaultTenantId) return cachedDefaultTenantId;
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "default")).limit(1);
  if (row) {
    cachedDefaultTenantId = row.id;
    return row.id;
  }
  logger.warn("No default tenant found - multi-tenant migration may not have run");
  return "default";
}

/** Resolve tenant and provider from webhook To (e.g. whatsapp:+14155238886). */
export async function resolveTenantAndProvider(toNumber: string): Promise<TenantProviderResult> {
  const toNorm = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;

  const [row] = await db
    .select()
    .from(tenantWabaProviders)
    .where(and(eq(tenantWabaProviders.whatsappFrom, toNorm), eq(tenantWabaProviders.isActive, true)))
    .limit(1);

  if (row && row.provider === "twilio") {
    const config = row.config as unknown as TwilioProviderConfig;
    if (config?.accountSid && config?.authToken) {
      return {
        tenantId: row.tenantId,
        credentials: {
          provider: "twilio",
          whatsappFrom: row.whatsappFrom,
          config: { accountSid: config.accountSid, authToken: config.authToken },
        },
      };
    }
    logger.warn("Tenant WABA provider has invalid Twilio config", { tenantId: row.tenantId });
  }

  const tenantId = await getDefaultTenantId();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FINJOE_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && from) {
    const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    return {
      tenantId,
      credentials: {
        provider: "twilio",
        whatsappFrom,
        config: { accountSid, authToken },
      },
    };
  }

  return { tenantId, credentials: null };
}

/** Get credentials for a tenant (for outbound sends). Uses tenant_waba_providers or env fallback for default tenant. */
export async function getCredentialsForTenant(tenantId: string): Promise<WabaProviderCredentials | null> {
  const [row] = await db
    .select()
    .from(tenantWabaProviders)
    .where(and(eq(tenantWabaProviders.tenantId, tenantId), eq(tenantWabaProviders.provider, "twilio"), eq(tenantWabaProviders.isActive, true)))
    .limit(1);

  if (row) {
    const config = row.config as unknown as TwilioProviderConfig;
    if (config?.accountSid && config?.authToken) {
      return {
        provider: "twilio",
        whatsappFrom: row.whatsappFrom,
        config: { accountSid: config.accountSid, authToken: config.authToken },
      };
    }
  }

  const defaultTenantId = await getDefaultTenantId();
  if (tenantId !== defaultTenantId) return null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FINJOE_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_FROM;
  if (accountSid && authToken && from) {
    const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    return {
      provider: "twilio",
      whatsappFrom,
      config: { accountSid, authToken },
    };
  }
  return null;
}
