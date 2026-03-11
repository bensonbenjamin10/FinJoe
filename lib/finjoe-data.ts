/**
 * FinJoe data layer - direct DB access for FinJoe service.
 */

import { eq, and, desc, sql, or, isNull } from "drizzle-orm";
import {
  campuses,
  expenseCategories,
  finjoeSettings,
  expenses,
  finJoeRoleChangeRequests,
  finJoeContacts,
  finJoeTasks,
  pettyCashFunds,
  users,
} from "../shared/schema";

export type FinJoeDb = any;

export type CampusInfo = { id: string; name: string; slug: string };
export type CategoryInfo = { id: string; name: string; slug: string };
export type AuditRequirements = {
  required: string[];
  optional: string[];
  gstinFormat: string;
  taxTypes: string[];
};
export type FinJoeSettings = {
  finjoeExpenseApprovalTemplateSid: string | null;
  finjoeExpenseApprovedTemplateSid: string | null;
  finjoeExpenseRejectedTemplateSid: string | null;
  finjoeReEngagementTemplateSid: string | null;
  notificationEmails: string | null;
  resendFromEmail: string | null;
  smsFrom: string | null;
};

const AUDIT_REQUIREMENTS: AuditRequirements = {
  required: ["invoiceNumber", "invoiceDate", "vendorName"],
  optional: ["gstin", "taxType"],
  gstinFormat: "15 characters",
  taxTypes: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"],
};

export type CreateExpenseInput = {
  tenantId: string;
  campusId: string | null;
  categoryId: string;
  amount: number;
  expenseDate: string;
  description?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  vendorName?: string | null;
  gstin?: string | null;
  taxType?: string | null;
  submittedByContactPhone?: string | null;
};

export type CreateRoleChangeInput = {
  tenantId: string;
  contactPhone: string;
  requestedRole: string;
  name: string;
  campusId?: string | null;
  studentId?: string | null;
};

export function createFinJoeData(db: FinJoeDb, tenantId: string) {
  return {
    async getCampuses(): Promise<CampusInfo[]> {
      const rows = await db
        .select({ id: campuses.id, name: campuses.name, slug: campuses.slug })
        .from(campuses)
        .where(and(eq(campuses.isActive, true), eq(campuses.tenantId, tenantId)))
        .orderBy(campuses.name);
      return rows;
    },

    async getExpenseCategories(): Promise<CategoryInfo[]> {
      const rows = await db
        .select({ id: expenseCategories.id, name: expenseCategories.name, slug: expenseCategories.slug })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tenantId), isNull(expenseCategories.tenantId))))
        .orderBy(expenseCategories.displayOrder, expenseCategories.name);
      return rows;
    },

    getAuditRequirements(): AuditRequirements {
      return AUDIT_REQUIREMENTS;
    },

    async getFinJoeSettings(): Promise<FinJoeSettings | null> {
      const [settings] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, tenantId)).limit(1);
      if (!settings) return null;
      return {
        finjoeExpenseApprovalTemplateSid: settings.expenseApprovalTemplateSid ?? null,
        finjoeExpenseApprovedTemplateSid: settings.expenseApprovedTemplateSid ?? null,
        finjoeExpenseRejectedTemplateSid: settings.expenseRejectedTemplateSid ?? null,
        finjoeReEngagementTemplateSid: settings.reEngagementTemplateSid ?? null,
        notificationEmails: settings.notificationEmails ?? null,
        resendFromEmail: settings.resendFromEmail ?? null,
        smsFrom: settings.smsFrom ?? null,
      };
    },

    async createExpense(data: CreateExpenseInput): Promise<{ id: string } | null> {
      const campusIdForDb = data.campusId === "__corporate__" || data.campusId === "null" ? null : data.campusId;
      const [created] = await db
        .insert(expenses)
        .values({
          tenantId: data.tenantId,
          campusId: campusIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          expenseDate: new Date(data.expenseDate),
          description: data.description ?? null,
          status: "draft",
          source: "finjoe",
          invoiceNumber: data.invoiceNumber ?? null,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
          vendorName: data.vendorName ?? null,
          gstin: data.gstin ?? null,
          taxType: data.taxType ?? null,
          submittedByContactPhone: data.submittedByContactPhone ?? null,
        })
        .returning({ id: expenses.id });
      return created ?? null;
    },

    async getExpense(id: string): Promise<{ id: string; status: string } | null> {
      const [row] = await db
        .select({ id: expenses.id, status: expenses.status })
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
        .limit(1);
      return row ?? null;
    },

    async updateExpense(
      id: string,
      updates: {
        amount?: number;
        campusId?: string | null;
        categoryId?: string;
        expenseDate?: string;
        description?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
        vendorName?: string | null;
        gstin?: string | null;
        taxType?: string | null;
      }
    ): Promise<{ id: string } | null> {
      const existing = await this.getExpense(id);
      if (!existing) return null;
      if (existing.status !== "draft") return null;

      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.amount !== undefined) setValues.amount = updates.amount;
      if (updates.campusId !== undefined) setValues.campusId = updates.campusId;
      if (updates.categoryId !== undefined) setValues.categoryId = updates.categoryId;
      if (updates.expenseDate !== undefined) setValues.expenseDate = new Date(updates.expenseDate);
      if (updates.description !== undefined) setValues.description = updates.description;
      if (updates.invoiceNumber !== undefined) setValues.invoiceNumber = updates.invoiceNumber;
      if (updates.invoiceDate !== undefined) setValues.invoiceDate = updates.invoiceDate ? new Date(updates.invoiceDate) : null;
      if (updates.vendorName !== undefined) setValues.vendorName = updates.vendorName;
      if (updates.gstin !== undefined) setValues.gstin = updates.gstin;
      if (updates.taxType !== undefined) setValues.taxType = updates.taxType;

      const [updated] = await db
        .update(expenses)
        .set(setValues as Record<string, unknown>)
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ?? null;
    },

    async deleteExpense(id: string): Promise<boolean> {
      const existing = await this.getExpense(id);
      if (!existing) return false;
      if (existing.status !== "draft") return false;
      await db.update(finJoeTasks).set({ expenseId: null }).where(eq(finJoeTasks.expenseId, id));
      await db.delete(expenses).where(eq(expenses.id, id));
      return true;
    },

    async getExpenseWithDetails(id: string): Promise<Record<string, unknown> | null> {
      const [row] = await db
        .select()
        .from(expenses)
        .leftJoin(campuses, eq(expenses.campusId, campuses.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(users, eq(expenses.submittedById, users.id))
        .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
        .limit(1);
      if (!row?.expenses) return null;
      return {
        ...row.expenses,
        campus: row.campuses ? { id: row.campuses.id, name: row.campuses.name, slug: row.campuses.slug } : null,
        category: row.expense_categories ? { id: row.expense_categories.id, name: row.expense_categories.name, slug: row.expense_categories.slug } : null,
        submittedBy: row.users ? { id: row.users.id, name: row.users.name } : null,
      };
    },

    async listExpenses(filters?: {
      campusId?: string | null;
      status?: string;
      categoryId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(expenses.tenantId, tenantId)];
      if (filters?.campusId !== undefined && filters.campusId !== null && filters.campusId !== "") {
        if (filters.campusId === "null" || filters.campusId === "__corporate__") {
          conditions.push(sql`${expenses.campusId} IS NULL`);
        } else {
          conditions.push(eq(expenses.campusId, filters.campusId));
        }
      }
      if (filters?.status) conditions.push(eq(expenses.status, filters.status));
      if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
      if (filters?.startDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.startDate}::date`);
      if (filters?.endDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.endDate}::date`);

      let query = db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          status: expenses.status,
          expenseDate: expenses.expenseDate,
          vendorName: expenses.vendorName,
          description: expenses.description,
          campusName: campuses.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(campuses, eq(expenses.campusId, campuses.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .$dynamic();

      if (conditions.length > 0) query = query.where(and(...conditions));
      const limit = Math.min(filters?.limit ?? 50, 100);
      const rows = await query.limit(limit);
      return rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        expenseDate: r.expenseDate,
        vendorName: r.vendorName,
        description: r.description,
        campusName: r.campusName,
        categoryName: r.categoryName,
      }));
    },

    async listPendingApprovals(campusId?: string | null): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tenantId)];
      if (campusId && campusId !== "null" && campusId !== "__corporate__") {
        conditions.push(eq(expenses.campusId, campusId));
      } else if (campusId === "null" || campusId === "__corporate__") {
        conditions.push(sql`${expenses.campusId} IS NULL`);
      }
      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          expenseDate: expenses.expenseDate,
          campusName: campuses.name,
          description: expenses.description,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(campuses, eq(expenses.campusId, campuses.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(...conditions))
        .orderBy(desc(expenses.createdAt))
        .limit(50);
      return rows;
    },

    async listRoleChangeRequests(status?: string): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(finJoeRoleChangeRequests.tenantId, tenantId)];
      if (status) conditions.push(eq(finJoeRoleChangeRequests.status, status));
      let query = db
        .select({
          id: finJoeRoleChangeRequests.id,
          requestedRole: finJoeRoleChangeRequests.requestedRole,
          name: finJoeRoleChangeRequests.name,
          status: finJoeRoleChangeRequests.status,
          campusName: campuses.name,
          createdAt: finJoeRoleChangeRequests.createdAt,
        })
        .from(finJoeRoleChangeRequests)
        .leftJoin(campuses, eq(finJoeRoleChangeRequests.campusId, campuses.id))
        .orderBy(desc(finJoeRoleChangeRequests.createdAt))
        .limit(50)
        .$dynamic();
      if (conditions.length > 0) query = query.where(and(...conditions));
      return query;
    },

    async searchExpenses(query: string, limit = 20): Promise<Array<Record<string, unknown>>> {
      const q = query.trim();
      if (!q) return [];
      const pattern = `%${q}%`;
      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          status: expenses.status,
          vendorName: expenses.vendorName,
          invoiceNumber: expenses.invoiceNumber,
          description: expenses.description,
          campusName: campuses.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(campuses, eq(expenses.campusId, campuses.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(
          and(
            eq(expenses.tenantId, tenantId),
            or(
              sql`${expenses.vendorName}::text ILIKE ${pattern}`,
              sql`${expenses.invoiceNumber}::text ILIKE ${pattern}`,
              sql`${expenses.description}::text ILIKE ${pattern}`
            )
          )
        )
        .orderBy(desc(expenses.expenseDate))
        .limit(limit);
      return rows;
    },

    async getExpenseSummary(filters?: {
      startDate?: string;
      endDate?: string;
      campusId?: string | null;
      groupBy?: "status" | "campus" | "category";
    }): Promise<Record<string, unknown>> {
      const conditions = [eq(expenses.tenantId, tenantId)];
      if (filters?.startDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.startDate}::date`);
      if (filters?.endDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.endDate}::date`);
      if (filters?.campusId !== undefined && filters.campusId !== null && filters.campusId !== "" && filters.campusId !== "__corporate__") {
        if (filters.campusId === "null") {
          conditions.push(sql`${expenses.campusId} IS NULL`);
        } else {
          conditions.push(eq(expenses.campusId, filters.campusId));
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const baseQuery = db.select().from(expenses).$dynamic();
      const allRows = whereClause ? await baseQuery.where(whereClause) : await baseQuery;

      const totalAmount = allRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
      const byStatus: Record<string, number> = {};
      for (const r of allRows) {
        const s = r.status ?? "unknown";
        byStatus[s] = (byStatus[s] ?? 0) + (r.amount ?? 0);
      }

      return {
        totalAmount,
        count: allRows.length,
        byStatus,
      };
    },

    async getPendingWorkload(): Promise<{ pendingApprovals: number; pendingRoleRequests: number }> {
      const [approvals] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses)
        .where(and(eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tenantId)));
      const [roleReqs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(finJoeRoleChangeRequests)
        .where(and(eq(finJoeRoleChangeRequests.status, "pending"), eq(finJoeRoleChangeRequests.tenantId, tenantId)));
      return {
        pendingApprovals: approvals?.count ?? 0,
        pendingRoleRequests: roleReqs?.count ?? 0,
      };
    },

    async getPettyCashSummary(campusId?: string | null): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(pettyCashFunds.tenantId, tenantId)];
      if (campusId && campusId !== "null" && campusId !== "__corporate__") conditions.push(eq(pettyCashFunds.campusId, campusId));
      let query = db
        .select({
          id: pettyCashFunds.id,
          imprestAmount: pettyCashFunds.imprestAmount,
          currentBalance: pettyCashFunds.currentBalance,
          campusName: campuses.name,
          custodianName: users.name,
        })
        .from(pettyCashFunds)
        .leftJoin(campuses, eq(pettyCashFunds.campusId, campuses.id))
        .leftJoin(users, eq(pettyCashFunds.custodianId, users.id))
        .where(and(...conditions));
      return query;
    },

    async submitExpense(id: string, submittedById: string | null): Promise<{ id: string } | null> {
      const existing = await this.getExpense(id);
      if (!existing) return null;
      if (existing.status !== "draft") return null;

      const [updated] = await db
        .update(expenses)
        .set({
          status: "pending_approval",
          submittedById: submittedById ?? null,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ?? null;
    },

    async approveExpense(id: string, approvedById: string): Promise<{ id: string; submittedByContactPhone?: string | null } | null> {
      const [existing] = await db
        .select({ status: expenses.status, submittedByContactPhone: expenses.submittedByContactPhone })
        .from(expenses)
        .where(eq(expenses.id, id))
        .limit(1);
      if (!existing) return null;
      if (existing.status !== "pending_approval") return null;

      const [updated] = await db
        .update(expenses)
        .set({
          status: "approved",
          approvedById,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ? { ...updated, submittedByContactPhone: existing.submittedByContactPhone } : null;
    },

    async rejectExpense(id: string, approvedById: string, reason: string): Promise<{ id: string; submittedByContactPhone?: string | null } | null> {
      const [existing] = await db
        .select({ status: expenses.status, submittedByContactPhone: expenses.submittedByContactPhone })
        .from(expenses)
        .where(eq(expenses.id, id))
        .limit(1);
      if (!existing) return null;
      if (existing.status !== "pending_approval") return null;

      const [updated] = await db
        .update(expenses)
        .set({
          status: "rejected",
          approvedById,
          approvedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ? { ...updated, submittedByContactPhone: existing.submittedByContactPhone } : null;
    },

    async recordExpensePayout(
      id: string,
      payoutMethod: string,
      payoutRef: string
    ): Promise<{ id: string } | null> {
      const validMethods = ["bank_transfer", "upi", "cash", "cheque", "demand_draft"];
      const method = validMethods.includes(payoutMethod) ? payoutMethod : "bank_transfer";
      const [existing] = await db
        .select({ status: expenses.status })
        .from(expenses)
        .where(eq(expenses.id, id))
        .limit(1);
      if (!existing) return null;
      if (existing.status !== "approved") return null;

      const [updated] = await db
        .update(expenses)
        .set({
          status: "paid",
          payoutMethod: method,
          payoutRef: payoutRef || "marked via FinJoe WhatsApp",
          payoutAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ?? null;
    },

    async createRoleChangeRequest(data: CreateRoleChangeInput): Promise<{ id: string } | null> {
      try {
        const [created] = await db
          .insert(finJoeRoleChangeRequests)
          .values({
            tenantId: data.tenantId,
            contactPhone: data.contactPhone,
            requestedRole: data.requestedRole,
            name: data.name,
            campusId: data.campusId ?? null,
            studentId: data.studentId ?? null,
            status: "pending",
          })
          .returning({ id: finJoeRoleChangeRequests.id });
        return created ?? null;
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23503") {
          return null;
        }
        throw err;
      }
    },

    async approveRoleRequest(id: string, approvedById: string, approvedVia = "whatsapp"): Promise<{ id: string } | null> {
      const [reqRow] = await db
        .select()
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, id))
        .limit(1);
      if (!reqRow) return null;
      if (reqRow.status !== "pending") return null;

      await db
        .update(finJoeRoleChangeRequests)
        .set({
          status: "approved",
          approvedBy: approvedById,
          approvedAt: new Date(),
          approvedVia,
        })
        .where(eq(finJoeRoleChangeRequests.id, id));

      await db
        .update(finJoeContacts)
        .set({
          role: reqRow.requestedRole,
          name: reqRow.name,
          campusId: reqRow.campusId,
          studentId: reqRow.studentId,
          updatedAt: new Date(),
        })
        .where(and(eq(finJoeContacts.tenantId, reqRow.tenantId), eq(finJoeContacts.phone, reqRow.contactPhone)));

      return { id };
    },

    async rejectRoleRequest(id: string, approvedById: string, reason?: string, approvedVia = "whatsapp"): Promise<{ id: string } | null> {
      const [reqRow] = await db
        .select()
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, id))
        .limit(1);
      if (!reqRow) return null;
      if (reqRow.status !== "pending") return null;

      await db
        .update(finJoeRoleChangeRequests)
        .set({
          status: "rejected",
          approvedBy: approvedById,
          approvedAt: new Date(),
          approvedVia,
          rejectionReason: reason ?? null,
        })
        .where(eq(finJoeRoleChangeRequests.id, id));

      return { id };
    },
  };
}

export type FinJoeData = ReturnType<typeof createFinJoeData>;
