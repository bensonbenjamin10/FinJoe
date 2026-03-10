import { Request, Response } from "express";
import twilio from "twilio";

const { validateIncomingRequest } = twilio;
import { db } from "./db.js";
import { logger } from "./logger.js";
import {
  finJoeContacts,
  finJoeConversations,
  finJoeMessages,
  finJoeMedia,
} from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";
import { sendFinJoeWhatsApp, sendTypingIndicator, normalizePhone } from "./twilio.js";
import { downloadTwilioMedia } from "./media.js";
import { processWithAgent } from "./agent/agent.js";
import { getOrCreateConversation } from "./conversation.js";
import { wasOutside24hBeforeMessage } from "./window.js";
import { sendReEngagementIfNeeded } from "./send.js";

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

/** Get or create contact by phone (creates guest if unknown) */
async function getOrCreateContact(phone: string) {
  const normalized = normalizePhone(phone);
  let contact = (await db.select().from(finJoeContacts).where(eq(finJoeContacts.phone, normalized)).limit(1))[0];
  if (!contact && normalized.length >= 10) {
    const last10 = normalized.slice(-10);
    const fallback = (await db
      .select()
      .from(finJoeContacts)
      .where(sql`${finJoeContacts.phone} LIKE ${"%" + last10}`)
      .limit(1))[0];
    if (fallback) {
      contact = fallback;
      logger.info("Contact matched by fallback (last 10 digits)", { from: phone, normalized, matchedContact: contact.phone });
    }
  }
  if (!contact) {
    logger.info("Creating guest contact (no match)", { from: phone, normalized });
    const [inserted] = await db
      .insert(finJoeContacts)
      .values({
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
  // Log incoming request (before validation) for debugging
  logger.info("Webhook request received", {
    hasBody: !!req.body,
    from: req.body?.From,
    messageSid: req.body?.MessageSid,
  });

  // Validate Twilio signature - use explicit URL when behind proxy (Railway) so protocol/host match
  const webhookUrl =
    process.env.FINJOE_WEBHOOK_URL || "https://finjoe.medpg.online/webhook/finjoe";
  const isValid =
    process.env.TWILIO_AUTH_TOKEN &&
    validateIncomingRequest(req, process.env.TWILIO_AUTH_TOKEN, { url: webhookUrl });

  if (!isValid) {
    logger.warn("Webhook signature validation failed", {
      from: req.body?.From,
      hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
      webhookUrl,
    });
    res.status(403).send("Forbidden");
    return;
  }

  const params = req.body as Record<string, string>;
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
    const contact = await getOrCreateContact(from);
    if (await wasOutside24hBeforeMessage(contact.phone)) {
      await sendReEngagementIfNeeded(contact.phone, traceId);
    }
    const conversation = await getOrCreateConversation(contact.phone);
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

    // Download and store media
    if (numMedia > 0 && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`];
        const contentType = params[`MediaContentType${i}`] || "application/octet-stream";
        if (mediaUrl) {
          try {
            const { buffer, contentType: ct } = await downloadTwilioMedia(
              mediaUrl,
              contentType,
              process.env.TWILIO_ACCOUNT_SID,
              process.env.TWILIO_AUTH_TOKEN
            );
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
    sendTypingIndicator(messageSid, traceId);

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
            contact.name,
            contact.campusId ?? undefined
          );
        } catch (err) {
          logger.error("Agent processing error", { traceId, err: String(err) });
          reply = "Something went wrong on my side. Please try again in a moment, or send your message again.";
        }
      } else {
        reply = "Got it, processing... FinJoe will get back to you shortly.";
      }
      const sendResult = await sendFinJoeWhatsApp(contact.phone, reply, traceId);
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
    logger.error("Webhook error", { traceId, err: String(err) });
    res.status(500).send("Internal Server Error");
  }
}
