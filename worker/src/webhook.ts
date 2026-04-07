import { Request, Response } from "express";
import { db } from "./db.js";
import { logger, serializeError } from "./logger.js";
import {
  finJoeContacts,
  finJoeConversations,
  finJoeMessages,
  finJoeMedia,
  finJoeOutboundIdempotency,
  tenants,
} from "../../shared/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { sendFinJoeWhatsApp, sendTypingIndicator, normalizePhone } from "./twilio.js";
import { processWithAgent } from "./agent/agent.js";
import { getOrCreateConversation } from "./conversation.js";
import { wasOutside24hBeforeMessage } from "./window.js";
import { sendReEngagementIfNeeded } from "./send.js";
import { resolveTenantAndProvider } from "./providers/resolver.js";
import { validateTwilioWebhook } from "./providers/twilio-provider.js";
import { saveMedia } from "../../lib/media-storage.js";
import { createHash } from "crypto";

/** Per-conversation lock to serialize processing and preserve message order */
const conversationLocks = new Map<string, Promise<void>>();
const FALLBACK_REPLY = "I received your message, but I hit a temporary delivery issue. Please try again in a minute.";

/** Last n digits for structured logs only; never log full phone numbers. */
function phoneLastDigits(phoneLike: string, n = 4): string {
  const d = phoneLike.replace(/\D/g, "");
  if (d.length < n) return "****";
  return `…${d.slice(-n)}`;
}

type OutboundSendReservation =
  | { state: "new" | "retry"; rowId: string }
  | { state: "already_sent"; providerMessageSid?: string | null }
  | { state: "in_flight" };

function makePayloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function buildOutboundIdempotencyKey(
  conversationId: string,
  inboundMessageSid: string,
  type: "primary" | "fallback",
  payloadHash: string
): string {
  return `${conversationId}:${inboundMessageSid}:${type}:${payloadHash.slice(0, 16)}`;
}

async function reserveOutboundSend(
  tenantId: string,
  conversationId: string,
  inboundMessageSid: string,
  key: string,
  payloadHash: string
): Promise<OutboundSendReservation> {
  const [inserted] = await db
    .insert(finJoeOutboundIdempotency)
    .values({
      tenantId,
      conversationId,
      inboundMessageSid,
      idempotencyKey: key,
      payloadHash,
      status: "in_flight",
      attemptCount: 1,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: finJoeOutboundIdempotency.id });
  if (inserted?.id) return { state: "new", rowId: inserted.id };

  const [existing] = await db
    .select({
      id: finJoeOutboundIdempotency.id,
      status: finJoeOutboundIdempotency.status,
      providerMessageSid: finJoeOutboundIdempotency.providerMessageSid,
      attemptCount: finJoeOutboundIdempotency.attemptCount,
    })
    .from(finJoeOutboundIdempotency)
    .where(and(eq(finJoeOutboundIdempotency.tenantId, tenantId), eq(finJoeOutboundIdempotency.idempotencyKey, key)))
    .limit(1);

  if (!existing) {
    return { state: "in_flight" };
  }
  if (existing.status === "sent") {
    return { state: "already_sent", providerMessageSid: existing.providerMessageSid };
  }
  if (existing.status === "in_flight") {
    return { state: "in_flight" };
  }
  await db
    .update(finJoeOutboundIdempotency)
    .set({
      status: "in_flight",
      attemptCount: sql`${finJoeOutboundIdempotency.attemptCount} + 1`,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(finJoeOutboundIdempotency.id, existing.id));
  return { state: "retry", rowId: existing.id };
}

async function markOutboundSendSent(rowId: string, providerMessageSid?: string | null): Promise<void> {
  await db
    .update(finJoeOutboundIdempotency)
    .set({
      status: "sent",
      providerMessageSid: providerMessageSid ?? null,
      updatedAt: new Date(),
    })
    .where(eq(finJoeOutboundIdempotency.id, rowId));
}

async function markOutboundSendFailed(rowId: string, err: unknown): Promise<void> {
  await db
    .update(finJoeOutboundIdempotency)
    .set({
      status: "failed",
      lastError: String(err),
      updatedAt: new Date(),
    })
    .where(eq(finJoeOutboundIdempotency.id, rowId));
}

async function withConversationLock(conversationId: string, fn: () => Promise<void>): Promise<void> {
  const prev = conversationLocks.get(conversationId) ?? Promise.resolve();
  const ours = prev
    .then(() => fn())
    .catch((err) => {
      logger.error("Conversation lock task failed", { conversationId, ...serializeError(err) });
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

/** Route platform demo number to the correct seeded demo tenant by caller phone */
async function resolveDemoTenantForInboundPhone(fromRaw: string): Promise<string | null> {
  const normalized = normalizePhone(fromRaw);
  const [row] = await db
    .select({ tenantId: finJoeContacts.tenantId })
    .from(finJoeContacts)
    .innerJoin(tenants, eq(finJoeContacts.tenantId, tenants.id))
    .where(and(eq(tenants.isDemo, true), eq(finJoeContacts.phone, normalized)))
    .orderBy(desc(finJoeContacts.createdAt))
    .limit(1);
  return row?.tenantId ?? null;
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
  const resolved = await resolveTenantAndProvider(to);
  let tenantId = resolved.tenantId;
  const credentials = resolved.credentials;

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

  // Only apply demo routing when the To number wasn't matched to a specific tenant's WABA provider.
  // If a tenant has their own WhatsApp number configured, messages to that number must stay with that tenant.
  let demoRoutingApplied = false;
  if (!resolved.resolvedFromDb) {
    const demoTenantOverride = await resolveDemoTenantForInboundPhone(from);
    if (demoTenantOverride) {
      tenantId = demoTenantOverride;
      demoRoutingApplied = true;
    }
  }

  logger.info("Webhook tenant routing", {
    channel: "whatsapp_webhook",
    traceId,
    tenantId,
    resolvedFromDb: resolved.resolvedFromDb,
    demoRoutingApplied,
    toNumberLast4: phoneLastDigits(to),
    fromNumberLast4: phoneLastDigits(from),
  });

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
            const mediaId = crypto.randomUUID();
            const storagePath = await saveMedia(mediaId, buffer, ct, tenantId);
            await db.insert(finJoeMedia).values({
              id: mediaId,
              messageId: msg.id,
              contentType: ct,
              data: storagePath ? null : buffer,
              storagePath: storagePath ?? undefined,
              sizeBytes: buffer.length,
            });
          } catch (err) {
            logger.error("Failed to store media", { traceId, mediaIndex: i, ...serializeError(err) });
          }
        }
      }
    }

    // Phase 2: Use AI when configured (serialized per conversation to preserve message order)
    sendTypingIndicator(messageSid, traceId, { credentials: credentials ?? undefined });

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
          logger.error("Agent processing error", { traceId, ...serializeError(err) });
          reply = "Something went wrong on my side. Please try again in a moment, or send your message again.";
        }
      } else {
        reply = "Got it, processing... FinJoe will get back to you shortly.";
      }
      let sendResult: { sid?: string } | null = null;
      let outboundBody = reply;

      let primaryReservation: OutboundSendReservation | null = null;
      try {
        const primaryHash = makePayloadHash(reply);
        const primaryKey = buildOutboundIdempotencyKey(conversation.id, messageSid, "primary", primaryHash);
        primaryReservation = await reserveOutboundSend(tenantId, conversation.id, messageSid, primaryKey, primaryHash);

        if (primaryReservation.state === "already_sent") {
          sendResult = primaryReservation.providerMessageSid ? { sid: primaryReservation.providerMessageSid } : null;
          logger.info("Primary outbound reply deduped from idempotency", { traceId, conversationId: conversation.id, key: primaryKey });
        } else if (primaryReservation.state === "in_flight") {
          logger.warn("Primary outbound reply currently in-flight; skipping duplicate send", { traceId, conversationId: conversation.id, key: primaryKey });
        }
      } catch (idempErr) {
        logger.warn("Outbound idempotency check failed; proceeding without dedup", { traceId, err: String(idempErr) });
        primaryReservation = null;
      }

      const shouldSend = !primaryReservation || primaryReservation.state === "new" || primaryReservation.state === "retry";
      if (shouldSend) {
        try {
          sendResult = await sendFinJoeWhatsApp(contact.phone, reply, traceId, tenantId, { maxAttempts: 3 });
          if (primaryReservation && (primaryReservation.state === "new" || primaryReservation.state === "retry")) {
            await markOutboundSendSent(primaryReservation.rowId, sendResult?.sid ?? null).catch(() => {});
          }
        } catch (sendErr) {
          if (primaryReservation && (primaryReservation.state === "new" || primaryReservation.state === "retry")) {
            await markOutboundSendFailed(primaryReservation.rowId, sendErr).catch(() => {});
          }
          logger.error("Primary WhatsApp reply failed", { traceId, conversationId: conversation.id, contactPhone: contact.phone, ...serializeError(sendErr) });

          outboundBody = FALLBACK_REPLY;
          try {
            sendResult = await sendFinJoeWhatsApp(contact.phone, FALLBACK_REPLY, traceId, tenantId, { maxAttempts: 2 });
            logger.warn("Fallback reply delivered after primary failure", { traceId, conversationId: conversation.id, contactPhone: contact.phone });
          } catch (fallbackErr) {
            logger.error("Fallback WhatsApp reply also failed", {
              traceId,
              conversationId: conversation.id,
              contactPhone: contact.phone,
              ...serializeError(fallbackErr),
            });
          }
        }
      }
      if (!sendResult) {
        logger.error("No outbound message SID after all attempts", { traceId, conversationId: conversation.id, contactPhone: contact.phone });
      }

      logger.info("Webhook completed", { traceId, conversationId: conversation.id });

      // Store outbound message (with messageSid when available for proof of transactions)
      await db.insert(finJoeMessages).values({
        conversationId: conversation.id,
        direction: "out",
        body: outboundBody,
        messageSid: (sendResult as { sid?: string } | null)?.sid ?? undefined,
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
    logger.error("Webhook error", { traceId, ...serializeError(err) });
    res.status(500).send("Internal Server Error");
  }
}
