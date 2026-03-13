import { Request, Response } from "express";
import { db } from "./db.js";
import { logger } from "./logger.js";
import {
  finJoeContacts,
  finJoeConversations,
  finJoeMessages,
  finJoeMedia,
} from "../../shared/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { sendFinJoeWhatsApp, sendTypingIndicator, normalizePhone } from "./twilio.js";
import { processWithAgent } from "./agent/agent.js";
import { getOrCreateConversation } from "./conversation.js";
import { wasOutside24hBeforeMessage } from "./window.js";
import { sendReEngagementIfNeeded } from "./send.js";
import { resolveTenantAndProvider } from "./providers/resolver.js";
import { validateTwilioWebhook } from "./providers/twilio-provider.js";

/** Per-conversation lock to serialize processing and preserve message order */
const conversationLocks = new Map<string, Promise<void>>();

async function withConversationLock(conversationId: string, fn: () => Promise<void>): Promise<void> {
  const prev = conversationLocks.get(conversationId) ?? Promise.resolve();
  const ours = prev
    .then(() => fn())
    .catch((err) => {
      logger.error("Conversation lock task failed", { conversationId, err: String(err) });
      throw err;
    });
  conversationLocks.set(conversationId, ours);
  await ours;
  if (conversationLocks.get(conversationId) === ours) {
    conversationLocks.delete(conversationId);
  }
}

/** Get or create contact by phone within tenant (creates guest if unknown) */
async function getOrCreateContact(phone: string, tenantId: string) {
  const normalized = normalizePhone(phone);
  let contact = (
    await db
      .select()
      .from(finJoeContacts)
      .where(and(eq(finJoeContacts.phone, normalized), eq(finJoeContacts.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!contact && normalized.length >= 10) {
    const last10 = normalized.slice(-10);
    const fallback = (
      await db
        .select()
        .from(finJoeContacts)
        .where(and(eq(finJoeContacts.tenantId, tenantId), sql`${finJoeContacts.phone} LIKE ${"%" + last10}`))
        .limit(1)
    )[0];
    if (fallback) {
      contact = fallback;
      logger.info("Contact matched by fallback (last 10 digits)", { from: phone, normalized, matchedContact: contact.phone });
    }
  }
  if (!contact) {
    logger.info("Creating guest contact (no match)", { from: phone, normalized, tenantId });
    const [inserted] = await db
      .insert(finJoeContacts)
      .values({
        tenantId,
        phone: normalized,
        role: "guest",
        isActive: true,
      })
      .returning();
    contact = inserted!;
  }
  return contact;
}

/** Process incoming webhook - store message, media, reply */
export async function handleWebhook(req: Request, res: Response) {
  const params = (req.body || {}) as Record<string, string>;
  const to = params.To || "";

  logger.info("Webhook request received", {
    hasBody: !!req.body,
    from: params.From,
    messageSid: params.MessageSid,
  });

  // Resolve tenant and credentials from To number (needed for validation)
  const { tenantId, credentials } = await resolveTenantAndProvider(to);

  const webhookUrl =
    process.env.FINJOE_WEBHOOK_URL || "https://finjoe.app/webhook/finjoe";

  const isValid = credentials
    ? validateTwilioWebhook(req, credentials.config.authToken, webhookUrl)
    : false;

  if (!isValid) {
    logger.warn("Webhook signature validation failed", {
      from: params.From,
      tenantId,
      hasCredentials: !!credentials,
      webhookUrl,
    });
    res.status(403).send("Forbidden");
    return;
  }

  const from = params.From || "";
  const body = params.Body || "";
  const messageSid = params.MessageSid || "";
  const numMedia = parseInt(params.NumMedia || "0", 10);
  const traceId = messageSid;

  if (!from || !messageSid) {
    logger.warn("Webhook missing From or MessageSid", { traceId });
    res.status(400).send("Bad Request");
    return;
  }

  logger.info("Webhook received", { traceId, from, bodyLength: body?.length ?? 0, numMedia });

  // Idempotency: skip if already processed
  const [existing] = await db
    .select()
    .from(finJoeMessages)
    .where(eq(finJoeMessages.messageSid, messageSid))
    .limit(1);
  if (existing) {
    logger.info("Duplicate message skipped (idempotency)", { traceId });
    res.status(200).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    return;
  }

  try {
    const contact = await getOrCreateContact(from, tenantId);
    if (await wasOutside24hBeforeMessage(contact.phone, tenantId)) {
      await sendReEngagementIfNeeded(contact.phone, tenantId, traceId);
    }
    const conversation = await getOrCreateConversation(contact.phone, tenantId);
    logger.info("Contact and conversation resolved", { traceId, contactId: contact.id, conversationId: conversation.id, role: contact.role });

    // Insert incoming message
    const [msg] = await db
      .insert(finJoeMessages)
      .values({
        conversationId: conversation.id,
        direction: "in",
        body: body || null,
        messageSid,
      })
      .returning();

    if (!msg) throw new Error("Failed to insert message");

    // Download and store media (using tenant credentials)
    if (numMedia > 0 && credentials) {
      const { downloadMedia } = await import("./providers/twilio-provider.js");
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`];
        const contentType = params[`MediaContentType${i}`] || "application/octet-stream";
        if (mediaUrl) {
          try {
            const { buffer, contentType: ct } = await downloadMedia(credentials, mediaUrl, contentType);
            await db.insert(finJoeMedia).values({
              messageId: msg.id,
              contentType: ct,
              data: buffer,
              sizeBytes: buffer.length,
            });
          } catch (err) {
            logger.error("Failed to store media", { traceId, mediaIndex: i, err: String(err) });
          }
        }
      }
    }

    // Phase 2: Use AI when configured (serialized per conversation to preserve message order)
    sendTypingIndicator(messageSid, traceId, { credentials });

    await withConversationLock(conversation.id, async () => {
      let reply: string;
      if (process.env.GEMINI_API_KEY) {
        try {
          reply = await processWithAgent(
            conversation.id,
            contact.phone,
            contact.role,
            contact.studentId,
            body || "",
            msg.id,
            traceId,
            tenantId,
            contact.name,
            contact.costCenterId ?? undefined
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : undefined;
          logger.error("Agent processing error", { traceId, err: errMsg, stack: errStack });
          reply = "Something went wrong on my side. Please try again in a moment, or send your message again.";
        }
      } else {
        reply = "Got it, processing... FinJoe will get back to you shortly.";
      }
      const sendResult = await sendFinJoeWhatsApp(contact.phone, reply, traceId, tenantId);
      if (!sendResult) {
        logger.error("WhatsApp send returned null - Twilio may not be configured", { traceId });
      }

      logger.info("Webhook completed", { traceId, conversationId: conversation.id });

      // Store outbound message
      await db.insert(finJoeMessages).values({
        conversationId: conversation.id,
        direction: "out",
        body: reply,
      });

      // Update lastMessageAt so 24h window stays open
      const now = new Date();
      await db
        .update(finJoeConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(finJoeConversations.id, conversation.id));
    });

    res.status(200).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error("Webhook error", { traceId, err: errMsg, stack: errStack });
    res.status(500).send("Internal Server Error");
  }
}
