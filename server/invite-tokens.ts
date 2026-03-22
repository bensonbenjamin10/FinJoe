import crypto from "crypto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  return { raw, hash, expiresAt };
}

export function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
