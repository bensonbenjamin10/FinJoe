import { db } from "./db.js";
import { finJoeConversations } from "../../shared/schema.js";
import { eq, desc } from "drizzle-orm";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Check if the contact is within the WhatsApp 24-hour messaging window.
 * The window is open if the last message (in either direction) was within 24 hours.
 * Used to decide: free-form (within 24h) vs template (outside 24h).
 */
export async function isWithin24hWindow(contactPhone: string): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(finJoeConversations)
    .where(eq(finJoeConversations.contactPhone, contactPhone))
    .orderBy(desc(finJoeConversations.lastMessageAt))
    .limit(1);
  if (!conv) return false;
  const elapsed = Date.now() - conv.lastMessageAt.getTime();
  return elapsed < TWENTY_FOUR_HOURS_MS;
}

/**
 * Check if the contact's last activity was outside the 24h window (before this incoming message).
 * Used to send re-engagement template when user messages after long silence.
 */
export async function wasOutside24hBeforeMessage(contactPhone: string): Promise<boolean> {
  return !(await isWithin24hWindow(contactPhone));
}
