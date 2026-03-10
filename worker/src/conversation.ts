import { db } from "./db.js";
import { finJoeConversations } from "../../shared/schema.js";
import { eq, desc } from "drizzle-orm";

/** Get or create conversation for contact. Updates lastMessageAt when conversation exists. */
export async function getOrCreateConversation(contactPhone: string) {
  const now = new Date();
  let conv = (
    await db
      .select()
      .from(finJoeConversations)
      .where(eq(finJoeConversations.contactPhone, contactPhone))
      .orderBy(desc(finJoeConversations.lastMessageAt))
      .limit(1)
  )[0];
  if (!conv || conv.status === "closed") {
    const [inserted] = await db
      .insert(finJoeConversations)
      .values({
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
