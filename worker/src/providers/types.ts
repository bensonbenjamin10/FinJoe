/**
 * WABA (WhatsApp Business API) provider abstraction.
 * Supports Twilio now; 360dialog, MessageBird later.
 */

export type WabaProviderKind = "twilio" | "360dialog" | "messagebird";

/** Twilio-specific config stored in tenant_waba_providers.config */
export interface TwilioProviderConfig {
  accountSid: string;
  authToken: string;
}

/** Resolved provider credentials for a tenant (from DB or env fallback) */
export interface WabaProviderCredentials {
  provider: WabaProviderKind;
  /** WhatsApp From number (e.g. whatsapp:+14155238886) */
  whatsappFrom: string;
  /** Provider-specific config */
  config: TwilioProviderConfig;
}

/** Result of resolving tenant from webhook To number */
export interface TenantProviderResult {
  tenantId: string;
  credentials: WabaProviderCredentials | null;
}
