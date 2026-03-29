/**
 * Demo → real workspace switch: copy FinJoe settings and migrate WhatsApp graph without ALTER TABLE (no global FK locks).
 */

import { eq, and, inArray } from "drizzle-orm";
import {
  finJoeContacts,
  finJoeConversations,
  finJoeOutboundIdempotency,
  finJoeRoleChangeRequests,
  finJoeTasks,
  finjoeSettings,
} from "../../shared/schema.js";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { invalidateSendSettingsCache } from "../../worker/src/send.js";

/** Copy label/FY/notification prefs from demo tenant settings to the empty real tenant. */
export async function copyFinjoeSettingsDemoToReal(demoTenantId: string, realTenantId: string): Promise<void> {
  const [demoRow] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, demoTenantId)).limit(1);
  if (!demoRow) {
    logger.info("copyFinjoeSettingsDemoToReal: no demo settings row", { demoTenantId });
    return;
  }

  const [realRow] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, realTenantId)).limit(1);

  const {
    id: _id,
    tenantId: _tid,
    updatedAt: _u,
    ...rest
  } = demoRow;

  if (realRow) {
    await db
      .update(finjoeSettings)
      .set({
        expenseApprovalTemplateSid: rest.expenseApprovalTemplateSid,
        expenseApprovedTemplateSid: rest.expenseApprovedTemplateSid,
        expenseRejectedTemplateSid: rest.expenseRejectedTemplateSid,
        reEngagementTemplateSid: rest.reEngagementTemplateSid,
        notificationEmails: rest.notificationEmails,
        resendFromEmail: rest.resendFromEmail,
        smsFrom: rest.smsFrom,
        costCenterLabel: rest.costCenterLabel,
        costCenterType: rest.costCenterType,
        requireConfirmationBeforePost: rest.requireConfirmationBeforePost,
        requireAuditFieldsAboveAmount: rest.requireAuditFieldsAboveAmount,
        askOptionalFields: rest.askOptionalFields,
        fyStartMonth: rest.fyStartMonth,
        updatedAt: new Date(),
      })
      .where(eq(finjoeSettings.tenantId, realTenantId));
  } else {
    await db.insert(finjoeSettings).values({
      tenantId: realTenantId,
      expenseApprovalTemplateSid: rest.expenseApprovalTemplateSid,
      expenseApprovedTemplateSid: rest.expenseApprovedTemplateSid,
      expenseRejectedTemplateSid: rest.expenseRejectedTemplateSid,
      reEngagementTemplateSid: rest.reEngagementTemplateSid,
      notificationEmails: rest.notificationEmails,
      resendFromEmail: rest.resendFromEmail,
      smsFrom: rest.smsFrom,
      costCenterLabel: rest.costCenterLabel,
      costCenterType: rest.costCenterType,
      requireConfirmationBeforePost: rest.requireConfirmationBeforePost,
      requireAuditFieldsAboveAmount: rest.requireAuditFieldsAboveAmount,
      askOptionalFields: rest.askOptionalFields,
      fyStartMonth: rest.fyStartMonth,
      updatedAt: new Date(),
    });
  }

  await invalidateSendSettingsCache(realTenantId);
}

/**
 * For each contact phone on the demo tenant: ensure a row exists on the real tenant, move conversations/tasks, then remove the demo contact row.
 * Avoids DROP/ADD CONSTRAINT on fin_joe_conversations (no ACCESS EXCLUSIVE locks across tenants).
 */
export async function migrateFinJoeGraphDemoToReal(tx: any, demoTenantId: string, realTenantId: string): Promise<void> {
  const phoneRows = await tx
    .select({ phone: finJoeContacts.phone })
    .from(finJoeContacts)
    .where(eq(finJoeContacts.tenantId, demoTenantId))
    .groupBy(finJoeContacts.phone);

  for (const { phone } of phoneRows) {
    const [demoContact] = await tx
      .select()
      .from(finJoeContacts)
      .where(and(eq(finJoeContacts.tenantId, demoTenantId), eq(finJoeContacts.phone, phone)))
      .limit(1);
    if (!demoContact) continue;

    const [existingReal] = await tx
      .select({ id: finJoeContacts.id })
      .from(finJoeContacts)
      .where(and(eq(finJoeContacts.tenantId, realTenantId), eq(finJoeContacts.phone, phone)))
      .limit(1);

    if (!existingReal) {
      await tx.insert(finJoeContacts).values({
        tenantId: realTenantId,
        phone: demoContact.phone,
        role: demoContact.role,
        studentId: demoContact.studentId,
        name: demoContact.name,
        costCenterId: null,
        metadata: demoContact.metadata ?? {},
        isActive: demoContact.isActive,
        updatedAt: new Date(),
      });
    }

    const convRows = await tx
      .select({ id: finJoeConversations.id })
      .from(finJoeConversations)
      .where(and(eq(finJoeConversations.tenantId, demoTenantId), eq(finJoeConversations.contactPhone, phone)));
    const convIds = convRows.map((r: { id: string }) => r.id);

    if (convIds.length > 0) {
      await tx
        .update(finJoeOutboundIdempotency)
        .set({ tenantId: realTenantId, updatedAt: new Date() })
        .where(
          and(
            eq(finJoeOutboundIdempotency.tenantId, demoTenantId),
            inArray(finJoeOutboundIdempotency.conversationId, convIds),
          ),
        );
      await tx
        .update(finJoeTasks)
        .set({ tenantId: realTenantId, updatedAt: new Date() })
        .where(and(eq(finJoeTasks.tenantId, demoTenantId), inArray(finJoeTasks.conversationId, convIds)));
    }

    await tx
      .update(finJoeConversations)
      .set({ tenantId: realTenantId, updatedAt: new Date() })
      .where(and(eq(finJoeConversations.tenantId, demoTenantId), eq(finJoeConversations.contactPhone, phone)));

    await tx
      .update(finJoeRoleChangeRequests)
      .set({ tenantId: realTenantId })
      .where(and(eq(finJoeRoleChangeRequests.tenantId, demoTenantId), eq(finJoeRoleChangeRequests.contactPhone, phone)));

    await tx.delete(finJoeContacts).where(and(eq(finJoeContacts.tenantId, demoTenantId), eq(finJoeContacts.phone, phone)));
  }
}
