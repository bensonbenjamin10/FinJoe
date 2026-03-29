import { db } from "./db.js";
import { finJoeConversations } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Check if the contact is within the WhatsApp 24-hour messaging window.
 * The window is open if the last message (in either direction) was within 24 hours.
 * Used to decide: free-form (within 24h) vs template (outside 24h).
 */
export async function isWithin24hWindow(contactPhone: string, tenantId: string): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(finJoeConversations)
    .where(and(eq(finJoeConversations.contactPhone, contactPhone), eq(finJoeConversations.tenantId, tenantId)))
    .orderBy(desc(finJoeConversations.lastMessageAt))
    .limit(1);
  if (!conv) return false;
  const elapsed = Date.now() - conv.lastMessageAt.getTime();
  return elapsed < TWENTY_FOUR_HOURS_MS;
}

/**
 * Check if the contact's last activity was outside the 24h window (before this incoming message).
 * Used to send re-engagement template when user messages after long silence.
 * Returns false for brand-new contacts (no prior conversation) — re-engagement is not needed
 * when a user is initiating contact for the very first time.
 */
export async function wasOutside24hBeforeMessage(contactPhone: string, tenantId: string): Promise<boolean> {
  const [conv] = await db
    .select({ lastMessageAt: finJoeConversations.lastMessageAt })
    .from(finJoeConversations)
    .where(and(eq(finJoeConversations.contactPhone, contactPhone), eq(finJoeConversations.tenantId, tenantId)))
    .orderBy(desc(finJoeConversations.lastMessageAt))
    .limit(1);
  if (!conv) return false;
  return Date.now() - conv.lastMessageAt.getTime() >= TWENTY_FOUR_HOURS_MS;
}
