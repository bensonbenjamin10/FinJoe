/**
 * Resolve tenant and provider credentials from webhook To number.
 * Falls back to default tenant + env vars when no tenant_waba_providers row exists.
 */

import { db } from "../db.js";
import { tenants, tenantWabaProviders, finjoeSettings, platformSettings } from "../../../shared/schema.js";
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
      const smsFromOverride = config.smsFrom ?? (await getFinJoeSmsFrom(row.tenantId));
      const smsFrom = await resolveSmsFromAsync(row.whatsappFrom, smsFromOverride);
      return {
        tenantId: row.tenantId,
        credentials: {
          provider: "twilio",
          whatsappFrom: row.whatsappFrom,
          smsFrom,
          config: { accountSid: config.accountSid, authToken: config.authToken, smsFrom: config.smsFrom },
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
    const smsFrom = await resolveSmsFromAsync(whatsappFrom, process.env.TWILIO_SMS_FROM);
    return {
      tenantId,
      credentials: {
        provider: "twilio",
        whatsappFrom,
        smsFrom,
        config: { accountSid, authToken },
      },
    };
  }

  return { tenantId, credentials: null };
}

/** Resolve SMS from number: override > platform default > env > derive from whatsappFrom */
async function resolveSmsFromAsync(whatsappFrom: string, smsFromOverride?: string): Promise<string> {
  if (smsFromOverride && smsFromOverride.trim()) {
    const s = smsFromOverride.trim();
    return s.startsWith("+") ? s : `+${s.replace(/\D/g, "")}`;
  }
  const [platformRow] = await db
    .select({ defaultSmsFrom: platformSettings.defaultSmsFrom })
    .from(platformSettings)
    .where(eq(platformSettings.id, "default"))
    .limit(1);
  if (platformRow?.defaultSmsFrom?.trim()) {
    const s = platformRow.defaultSmsFrom.trim();
    return s.startsWith("+") ? s : `+${s.replace(/\D/g, "")}`;
  }
  if (process.env.TWILIO_SMS_FROM?.trim()) {
    const s = process.env.TWILIO_SMS_FROM.trim();
    return s.startsWith("+") ? s : `+${s.replace(/\D/g, "")}`;
  }
  const stripped = whatsappFrom.replace(/^whatsapp:/, "").trim();
  return stripped.startsWith("+") ? stripped : `+${stripped.replace(/\D/g, "")}`;
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
      const smsFromOverride = config.smsFrom ?? (await getFinJoeSmsFrom(tenantId));
      const smsFrom = await resolveSmsFromAsync(row.whatsappFrom, smsFromOverride);
      return {
        provider: "twilio",
        whatsappFrom: row.whatsappFrom,
        smsFrom,
        config: { accountSid: config.accountSid, authToken: config.authToken, smsFrom: config.smsFrom },
      };
    }
  }

  const defaultTenantId = await getDefaultTenantId();
  if (tenantId !== defaultTenantId) {
    const [demoTenant] = await db
      .select({ isDemo: tenants.isDemo })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (demoTenant?.isDemo) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FINJOE_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_FROM;
      if (accountSid && authToken && from) {
        const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
        const smsFromOverride = (await getFinJoeSmsFrom(tenantId)) ?? process.env.TWILIO_SMS_FROM;
        const smsFrom = await resolveSmsFromAsync(whatsappFrom, smsFromOverride);
        return {
          provider: "twilio",
          whatsappFrom,
          smsFrom,
          config: { accountSid, authToken },
        };
      }
      // Demo tenants share the platform Twilio number. If env vars aren't set, fall back
      // to the default tenant's WABA provider row (handles Railway/per-tenant credential setups).
      const [defaultWabaRow] = await db
        .select()
        .from(tenantWabaProviders)
        .where(and(eq(tenantWabaProviders.tenantId, defaultTenantId), eq(tenantWabaProviders.provider, "twilio"), eq(tenantWabaProviders.isActive, true)))
        .limit(1);
      if (defaultWabaRow) {
        const config = defaultWabaRow.config as unknown as TwilioProviderConfig;
        if (config?.accountSid && config?.authToken) {
          const smsFromOverride = config.smsFrom ?? (await getFinJoeSmsFrom(defaultTenantId));
          const smsFrom = await resolveSmsFromAsync(defaultWabaRow.whatsappFrom, smsFromOverride);
          return {
            provider: "twilio",
            whatsappFrom: defaultWabaRow.whatsappFrom,
            smsFrom,
            config: { accountSid: config.accountSid, authToken: config.authToken, smsFrom: config.smsFrom },
          };
        }
      }
    }
    return null;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FINJOE_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_FROM;
  if (accountSid && authToken && from) {
    const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    const smsFromOverride = (await getFinJoeSmsFrom(tenantId)) ?? process.env.TWILIO_SMS_FROM;
    const smsFrom = await resolveSmsFromAsync(whatsappFrom, smsFromOverride);
    return {
      provider: "twilio",
      whatsappFrom,
      smsFrom,
      config: { accountSid, authToken },
    };
  }
  return null;
}

async function getFinJoeSmsFrom(tenantId: string): Promise<string | undefined> {
  const [row] = await db.select({ smsFrom: finjoeSettings.smsFrom }).from(finjoeSettings).where(eq(finjoeSettings.tenantId, tenantId)).limit(1);
  return row?.smsFrom ?? undefined;
}
