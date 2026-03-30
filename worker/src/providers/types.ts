/**
 * WABA (WhatsApp Business API) provider abstraction.
 * Supports Twilio now; 360dialog, MessageBird later.
 */

export type WabaProviderKind = "twilio" | "360dialog" | "messagebird";

/** Twilio-specific config stored in tenant_waba_providers.config */
export interface TwilioProviderConfig {
  accountSid: string;
  authToken: string;
  /** Optional SMS from number (e.g. +15558171150). Falls back to whatsappFrom without prefix. */
  smsFrom?: string;
}

/** Resolved provider credentials for a tenant (from DB or env fallback) */
export interface WabaProviderCredentials {
  provider: WabaProviderKind;
  /** WhatsApp From number (e.g. whatsapp:+14155238886) */
  whatsappFrom: string;
  /** SMS From number for fallback (e.g. +15558171150) */
  smsFrom: string;
  /** Provider-specific config */
  config: TwilioProviderConfig;
}

/** Result of resolving tenant from webhook To number */
export interface TenantProviderResult {
  tenantId: string;
  credentials: WabaProviderCredentials | null;
  /** True when tenantId was resolved by matching To against a tenant_waba_providers row */
  resolvedFromDb: boolean;
}
