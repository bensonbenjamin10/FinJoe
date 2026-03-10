import { db } from "./db.js";
import { finJoeConversations } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";

/** Get or create conversation for contact. Updates lastMessageAt when conversation exists. */
export async function getOrCreateConversation(contactPhone: string, tenantId: string) {
  const now = new Date();
  let conv = (
    await db
      .select()
      .from(finJoeConversations)
      .where(and(eq(finJoeConversations.contactPhone, contactPhone), eq(finJoeConversations.tenantId, tenantId)))
      .orderBy(desc(finJoeConversations.lastMessageAt))
      .limit(1)
  )[0];
  if (!conv || conv.status === "closed") {
    const [inserted] = await db
      .insert(finJoeConversations)
      .values({
        tenantId,
        contactPhone,
        lastMessageAt: now,
        status: "active",
      })
      .returning();
    conv = inserted!;
  } else {
    await db
      .update(finJoeConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(finJoeConversations.id, conv.id));
  }
  return conv;
}
