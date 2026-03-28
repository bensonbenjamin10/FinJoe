/**
 * Zoho Books OAuth + REST helpers (India: zohoapis.in / accounts.zoho.in).
 */

const DEFAULT_ACCOUNTS_BASE = "https://accounts.zoho.in";
const DEFAULT_BOOKS_API = "https://www.zohoapis.in/books/v3";

export function getZohoAccountsBase(): string {
  return (process.env.ZOHO_ACCOUNTS_BASE || DEFAULT_ACCOUNTS_BASE).replace(/\/$/, "");
}

export function getZohoBooksApiBase(): string {
  return (process.env.ZOHO_BOOKS_API_BASE || DEFAULT_BOOKS_API).replace(/\/$/, "");
}

export function buildZohoAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const scope = params.scope ?? "ZohoBooks.fullaccess.all";
  const u = new URL(`${getZohoAccountsBase()}/oauth/v2/auth`);
  u.searchParams.set("scope", scope);
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", params.state);
  return u.toString();
}

export async function exchangeZohoAuthorizationCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${getZohoAccountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error || json.message || res.statusText));
  }
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };
}

export async function refreshZohoAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${getZohoAccountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error || json.message || res.statusText));
  }
  return json as { access_token: string; expires_in: number; refresh_token?: string };
}

export async function zohoBooksGet<T>(
  path: string,
  accessToken: string,
  organizationId: string,
  query?: Record<string, string>,
): Promise<T> {
  const base = getZohoBooksApiBase();
  const u = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  u.searchParams.set("organization_id", organizationId);
  if (query) {
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const json = (await res.json()) as T & { message?: string; code?: number };
  if (!res.ok) {
    throw new Error(String((json as { message?: string }).message || res.statusText));
  }
  return json as T;
}

export async function zohoBooksPost<T>(
  path: string,
  accessToken: string,
  organizationId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = getZohoBooksApiBase();
  const u = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  u.searchParams.set("organization_id", organizationId);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new Error(String((json as { message?: string }).message || res.statusText));
  }
  return json as T;
}

export type ZohoOrg = { organization_id: string; name: string };

export async function listZohoOrganizations(accessToken: string): Promise<ZohoOrg[]> {
  const base = getZohoBooksApiBase();
  const res = await fetch(`${base}/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const json = (await res.json()) as { organizations?: ZohoOrg[]; message?: string };
  if (!res.ok) throw new Error(json.message || res.statusText);
  return json.organizations ?? [];
}
