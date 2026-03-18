/**
 * Shared notification helpers for FinJoe.
 * Callable from both server (web admin) and worker (WhatsApp agent).
 * Uses worker's send infrastructure for 24h routing (WhatsApp/SMS/email).
 */

import { eq, and, or } from "drizzle-orm";
import { db } from "../server/db.js";
import {
  expenses,
  finJoeContacts,
  finJoeRoleChangeRequests,
  users,
} from "../shared/schema.js";
import { toShortExpenseId, toShortUuid } from "./expense-id.js";
import { normalizePhone } from "../worker/src/twilio.js";
import {
  sendWith24hRouting,
  getExpenseApprovalTemplateConfig,
  notifySubmitterForApprovalRejection as workerNotifySubmitterForApprovalRejection,
} from "../worker/src/send.js";
import { sendFinJoeEmail } from "../worker/src/email.js";
import { logger } from "../server/logger.js";

const REASON_MAX_LENGTH = 200;

export type ExtractedExpenseForNotification = {
  amount?: number;
  vendorName?: string | null;
  description?: string | null;
  costCenterName?: string | null;
  submitterName?: string | null;
};

/** Resolve submitter contact (phone and/or email) from expense for notifications. */
export async function resolveSubmitterContact(
  expenseId: string,
  tenantId: string
): Promise<{ phone?: string; email?: string }> {
  const [row] = await db
    .select({
      submittedByContactPhone: expenses.submittedByContactPhone,
      submittedById: expenses.submittedById,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
    .limit(1);
  if (!row) return {};

  // Prefer WhatsApp contact phone
  if (row.submittedByContactPhone) {
    const phone = row.submittedByContactPhone;
    const email = await getSubmitterEmailFromContact(phone, tenantId);
    return { phone, email: email ?? undefined };
  }

  // Fallback: resolve from submittedById (web-submitted) -> user email, finJoeContact phone
  if (row.submittedById) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.submittedById))
      .limit(1);
    const [contact] = await db
      .select({ phone: finJoeContacts.phone })
      .from(finJoeContacts)
      .where(
        and(
          eq(finJoeContacts.tenantId, tenantId),
          eq(finJoeContacts.studentId, row.submittedById),
          eq(finJoeContacts.isActive, true)
        )
      )
      .limit(1);
    return {
      phone: contact?.phone,
      email: user?.email ?? undefined,
    };
  }
  return {};
}

async function getSubmitterEmailFromContact(contactPhone: string, tenantId: string): Promise<string | null> {
  const phoneNorm = normalizePhone(contactPhone);
  const [contact] = await db
    .select({ studentId: finJoeContacts.studentId })
    .from(finJoeContacts)
    .where(and(eq(finJoeContacts.tenantId, tenantId), eq(finJoeContacts.phone, phoneNorm)))
    .limit(1);
  if (!contact?.studentId) return null;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, contact.studentId)).limit(1);
  return user?.email ?? null;
}

/** Notify finance and admin contacts about expense needing approval (e.g. after web submit). */
export async function notifyFinanceForApproval(
  expenseId: string,
  extracted: ExtractedExpenseForNotification,
  tenantId: string,
  traceId?: string,
  categoryName?: string | null
): Promise<void> {
  const financeAndAdmin = await db
    .select()
    .from(finJoeContacts)
    .where(
      and(
        eq(finJoeContacts.tenantId, tenantId),
        eq(finJoeContacts.isActive, true),
        or(eq(finJoeContacts.role, "finance"), eq(finJoeContacts.role, "admin"))
      )
    );
  if (financeAndAdmin.length === 0) {
    logger.warn("No finance/admin contacts for tenant - skipping approval notification", { traceId, tenantId, expenseId });
    return;
  }
  const shortId = toShortExpenseId(expenseId);
  const amount = `₹${(extracted.amount ?? 0).toLocaleString("en-IN")}`;
  const parts: string[] = [`New expense #${shortId} needs approval: *${amount}*`];
  if (categoryName) parts.push(`Category: ${categoryName}`);
  if (extracted.vendorName) parts.push(`Vendor: ${extracted.vendorName}`);
  if (extracted.description && extracted.description !== categoryName) parts.push(`Note: ${extracted.description}`);
  if (extracted.costCenterName) parts.push(`Cost Center: ${extracted.costCenterName}`);
  if (extracted.submitterName) parts.push(`Submitted by: ${extracted.submitterName}`);
  parts.push(`Reply APPROVE ${shortId} or REJECT ${shortId} to act.`);
  const msg = parts.join("\n");
  const templateConfig = await getExpenseApprovalTemplateConfig(
    expenseId,
    extracted.amount ?? 0,
    tenantId,
    extracted.vendorName ?? undefined,
    extracted.description ?? undefined,
    categoryName ?? undefined
  );
  logger.info("Notifying finance/admin for approval (web)", { traceId, expenseId, count: financeAndAdmin.length });
  for (const c of financeAndAdmin) {
    try {
      await sendWith24hRouting(c.phone, msg, templateConfig, traceId, tenantId, { critical: true });
    } catch (err) {
      logger.error("Failed to notify finance", { traceId, phone: c.phone, err: String(err) });
    }
  }
}

/** Notify submitter when expense is approved or rejected. Resolves contact from expense. */
export async function notifySubmitterForApprovalRejectionFromExpense(
  expenseId: string,
  type: "approved" | "rejected",
  tenantId: string,
  reason?: string,
  traceId?: string,
  expenseContext?: { amount?: number | null; vendorName?: string | null; categoryName?: string | null; costCenterName?: string | null }
): Promise<boolean> {
  const contact = await resolveSubmitterContact(expenseId, tenantId);
  const shortId = toShortExpenseId(expenseId);
  const truncatedReason = reason && reason.length > REASON_MAX_LENGTH ? reason.slice(0, REASON_MAX_LENGTH) + "…" : reason;

  if (contact.phone) {
    return workerNotifySubmitterForApprovalRejection(
      contact.phone,
      expenseId,
      type,
      tenantId,
      truncatedReason,
      traceId,
      contact.email ?? null,
      expenseContext ?? undefined
    );
  }

  if (contact.email) {
    const subject = type === "approved"
      ? `FinJoe: Expense #${shortId} approved`
      : `FinJoe: Expense #${shortId} rejected`;
    const parts: string[] = [];
    if (type === "approved") {
      parts.push(`Good news! Your expense #${shortId} has been approved.`);
    } else {
      parts.push(`Your expense #${shortId} has been rejected.`);
    }
    if (expenseContext?.amount) parts.push(`Amount: ₹${expenseContext.amount.toLocaleString("en-IN")}`);
    if (expenseContext?.categoryName) parts.push(`Category: ${expenseContext.categoryName}`);
    if (expenseContext?.vendorName) parts.push(`Vendor: ${expenseContext.vendorName}`);
    if (expenseContext?.costCenterName) parts.push(`Cost Center: ${expenseContext.costCenterName}`);
    if (type === "rejected" && truncatedReason) parts.push(`Reason: ${truncatedReason}`);
    const body = parts.join("\n");
    const html = `<p>${body.replace(/\n/g, "<br>")}</p>`;
    try {
      const sent = await sendFinJoeEmail(
        [contact.email],
        subject,
        html,
        { tenantId, idempotencyKey: traceId ? `finjoe-${traceId}` : undefined },
        traceId
      );
      logger.info("Sent email-only approval/rejection notification", { traceId, expenseId, type });
      return sent;
    } catch (err) {
      logger.error("Failed to send email-only approval/rejection", { traceId, expenseId, err: String(err) });
      return false;
    }
  }

  logger.info("No submitter phone or email for expense - skipping approval/rejection notification", {
    traceId,
    expenseId,
  });
  return false;
}

/** Notify role request requester when their request is approved or rejected (e.g. via web admin). */
export async function notifyRoleRequestRequester(
  contactPhone: string,
  type: "approved" | "rejected",
  requestId: string,
  tenantId: string,
  reason?: string,
  traceId?: string,
  requestedRole?: string | null,
  campusName?: string | null
): Promise<boolean> {
  const shortId = toShortUuid(requestId);
  const truncatedReason = reason && reason.length > REASON_MAX_LENGTH ? reason.slice(0, REASON_MAX_LENGTH) + "…" : reason;
  const roleLabel = requestedRole ? requestedRole.replace(/_/g, " ") : null;
  if (type === "approved") {
    const parts: string[] = [`Good news! Your role change request #${shortId} has been approved.`];
    if (roleLabel) parts.push(`Role: ${roleLabel}`);
    if (campusName) parts.push(`Campus: ${campusName}`);
    parts.push("You can now use FinJoe with your new role.");
    return sendWith24hRouting(contactPhone, parts.join("\n"), null, traceId, tenantId, { critical: true });
  } else {
    const parts: string[] = [`Your role change request #${shortId} has been rejected.`];
    if (roleLabel) parts.push(`Requested role: ${roleLabel}`);
    if (campusName) parts.push(`Campus: ${campusName}`);
    if (truncatedReason) parts.push(`Reason: ${truncatedReason}`);
    return sendWith24hRouting(contactPhone, parts.join("\n"), null, traceId, tenantId, { critical: true });
  }
}

export type PayoutNotificationContext = {
  amount?: number | null;
  vendorName?: string | null;
  costCenterName?: string | null;
  payoutMethod?: string | null;
  payoutRef?: string | null;
};

/** Notify submitter when expense is marked as paid (payout). */
export async function notifySubmitterForPayout(
  to: string,
  expenseId: string,
  tenantId: string,
  traceId?: string,
  submitterEmail?: string | null,
  payoutContext?: PayoutNotificationContext
): Promise<boolean> {
  const shortId = toShortExpenseId(expenseId);
  const parts: string[] = [`Your expense #${shortId} has been marked as paid.`];
  if (payoutContext?.amount) parts.push(`Amount: ₹${payoutContext.amount.toLocaleString("en-IN")}`);
  if (payoutContext?.vendorName) parts.push(`Vendor: ${payoutContext.vendorName}`);
  if (payoutContext?.costCenterName) parts.push(`Cost Center: ${payoutContext.costCenterName}`);
  if (payoutContext?.payoutMethod) parts.push(`Method: ${payoutContext.payoutMethod.replace(/_/g, " ")}`);
  if (payoutContext?.payoutRef && payoutContext.payoutRef !== "marked via FinJoe WhatsApp") parts.push(`Reference: ${payoutContext.payoutRef}`);
  const msg = parts.join("\n");
  return sendWith24hRouting(to, msg, null, traceId, tenantId, {
    critical: true,
    submitterEmail,
  });
}

/** Notify submitter for payout, resolving contact from expense. */
export async function notifySubmitterForPayoutFromExpense(
  expenseId: string,
  tenantId: string,
  traceId?: string,
  payoutContext?: PayoutNotificationContext
): Promise<boolean> {
  const contact = await resolveSubmitterContact(expenseId, tenantId);
  const shortId = toShortExpenseId(expenseId);

  if (contact.phone) {
    return notifySubmitterForPayout(contact.phone, expenseId, tenantId, traceId, contact.email ?? null, payoutContext);
  }

  if (contact.email) {
    const subject = `FinJoe: Expense #${shortId} marked as paid`;
    const parts: string[] = [`Your expense #${shortId} has been marked as paid.`];
    if (payoutContext?.amount) parts.push(`Amount: ₹${payoutContext.amount.toLocaleString("en-IN")}`);
    if (payoutContext?.vendorName) parts.push(`Vendor: ${payoutContext.vendorName}`);
    if (payoutContext?.payoutMethod) parts.push(`Method: ${payoutContext.payoutMethod.replace(/_/g, " ")}`);
    const body = parts.join("\n");
    const html = `<p>${body.replace(/\n/g, "<br>")}</p>`;
    try {
      const sent = await sendFinJoeEmail(
        [contact.email],
        subject,
        html,
        { tenantId, idempotencyKey: traceId ? `finjoe-${traceId}` : undefined },
        traceId
      );
      logger.info("Sent email-only payout notification", { traceId, expenseId });
      return sent;
    } catch (err) {
      logger.error("Failed to send email-only payout", { traceId, expenseId, err: String(err) });
      return false;
    }
  }

  logger.info("No submitter phone or email for expense - skipping payout notification", {
    traceId,
    expenseId,
  });
  return false;
}
