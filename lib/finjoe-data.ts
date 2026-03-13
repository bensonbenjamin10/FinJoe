/**
 * FinJoe data layer - direct DB access for FinJoe service.
 */

import { eq, and, desc, sql, or, isNull } from "drizzle-orm";
import { embedExpenseText } from "./expense-embeddings.js";
import {
  costCenters,
  expenseCategories,
  finjoeSettings,
  expenses,
  finJoeRoleChangeRequests,
  finJoeContacts,
  finJoeTasks,
  pettyCashFunds,
  users,
  incomeCategories,
  incomeRecords,
  recurringExpenseTemplates,
  tenants,
} from "../shared/schema";

export type FinJoeDb = any;

export type CostCenterInfo = { id: string; name: string; slug: string };
export type CampusInfo = CostCenterInfo;
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
  costCenterLabel: string | null;
  costCenterType: string | null;
};

const AUDIT_REQUIREMENTS: AuditRequirements = {
  required: ["invoiceNumber", "invoiceDate", "vendorName"],
  optional: ["gstin", "taxType"],
  gstinFormat: "15 characters",
  taxTypes: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"],
};

export type CreateExpenseInput = {
  tenantId: string;
  costCenterId: string | null;
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
  source?: string;
  recurringTemplateId?: string | null;
};

export type CreateRoleChangeInput = {
  tenantId: string;
  contactPhone: string;
  requestedRole: string;
  name: string;
  costCenterId?: string | null;
  studentId?: string | null;
};

export type CreateRecurringTemplateInput = {
  tenantId: string;
  costCenterId: string | null;
  categoryId: string;
  amount: number;
  description?: string | null;
  vendorName?: string | null;
  frequency: "monthly" | "weekly" | "quarterly";
  dayOfMonth?: number;
  dayOfWeek?: number;
  startDate: string;
  endDate?: string | null;
  createdById?: string | null;
};

export type FinJoeDataPool = { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export function createFinJoeData(db: FinJoeDb, tenantId: string, pool?: FinJoeDataPool) {
  return {
    async getCostCenters(): Promise<CostCenterInfo[]> {
      const rows = await db
        .select({ id: costCenters.id, name: costCenters.name, slug: costCenters.slug })
        .from(costCenters)
        .where(and(eq(costCenters.isActive, true), eq(costCenters.tenantId, tenantId)))
        .orderBy(costCenters.name);
      return rows;
    },

    async getCampuses(): Promise<CampusInfo[]> {
      return this.getCostCenters();
    },

    async getExpenseCategories(): Promise<CategoryInfo[]> {
      const rows = await db
        .select({ id: expenseCategories.id, name: expenseCategories.name, slug: expenseCategories.slug })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tenantId), isNull(expenseCategories.tenantId))))
        .orderBy(expenseCategories.displayOrder, expenseCategories.name);
      return rows;
    },

    async getIncomeCategories(): Promise<CategoryInfo[]> {
      const rows = await db
        .select({ id: incomeCategories.id, name: incomeCategories.name, slug: incomeCategories.slug })
        .from(incomeCategories)
        .where(and(eq(incomeCategories.isActive, true), eq(incomeCategories.tenantId, tenantId)))
        .orderBy(incomeCategories.displayOrder, incomeCategories.name);
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
        costCenterLabel: settings.costCenterLabel ?? null,
        costCenterType: settings.costCenterType ?? null,
      };
    },

    async createExpense(data: CreateExpenseInput): Promise<{ id: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      const [created] = await db
        .insert(expenses)
        .values({
          tenantId: data.tenantId,
          costCenterId: costCenterIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          expenseDate: new Date(data.expenseDate),
          description: data.description ?? null,
          status: "draft",
          source: data.source ?? "finjoe",
          recurringTemplateId: data.recurringTemplateId ?? null,
          invoiceNumber: data.invoiceNumber ?? null,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
          vendorName: data.vendorName ?? null,
          gstin: data.gstin ?? null,
          taxType: data.taxType ?? null,
          submittedByContactPhone: data.submittedByContactPhone ?? null,
        })
        .returning({ id: expenses.id });
      if (created?.id && pool) {
        const [catRow] = await db
          .select({ name: expenseCategories.name })
          .from(expenseCategories)
          .where(eq(expenseCategories.id, data.categoryId))
          .limit(1);
        const categoryName = catRow?.name ?? null;
        const embedding = await embedExpenseText({
          vendorName: data.vendorName,
          description: data.description,
          particulars: null,
          categoryName,
          amount: data.amount,
          invoiceNumber: data.invoiceNumber,
        });
        if (embedding) {
          const vectorStr = "[" + embedding.join(",") + "]";
          await pool.query("UPDATE expenses SET embedding = $1::vector WHERE id = $2 AND tenant_id = $3", [
            vectorStr,
            created.id,
            data.tenantId,
          ]);
        }
      }
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
        costCenterId?: string | null;
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
      if (updates.costCenterId !== undefined) setValues.costCenterId = updates.costCenterId;
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
      if (updated?.id && pool) {
        const detail = await this.getExpenseWithDetails(id);
        if (detail) {
          const category = detail.category as { name?: string } | null | undefined;
          const embedding = await embedExpenseText({
            vendorName: (detail.vendorName ?? updates.vendorName) as string | null,
            description: (detail.description ?? updates.description) as string | null,
            particulars: detail.particulars as string | null,
            categoryName: category?.name ?? null,
            amount: (detail.amount ?? updates.amount) as number,
            invoiceNumber: (detail.invoiceNumber ?? updates.invoiceNumber) as string | null,
          });
          if (embedding) {
            const vectorStr = "[" + embedding.join(",") + "]";
            await pool.query("UPDATE expenses SET embedding = $1::vector WHERE id = $2 AND tenant_id = $3", [
              vectorStr,
              id,
              tenantId,
            ]);
          }
        }
      }
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
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(users, eq(expenses.submittedById, users.id))
        .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
        .limit(1);
      if (!row?.expenses) return null;
      const costCenter = (row as Record<string, unknown>).costCenters as { id: string; name: string; slug: string } | null | undefined;
      return {
        ...row.expenses,
        campus: costCenter ? { id: costCenter.id, name: costCenter.name, slug: costCenter.slug } : null,
        costCenter: costCenter ? { id: costCenter.id, name: costCenter.name, slug: costCenter.slug } : null,
        category: row.expense_categories ? { id: row.expense_categories.id, name: row.expense_categories.name, slug: row.expense_categories.slug } : null,
        submittedBy: row.users ? { id: row.users.id, name: row.users.name } : null,
      };
    },

    async listExpenses(filters?: {
      costCenterId?: string | null;
      campusId?: string | null;
      status?: string;
      categoryId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(expenses.tenantId, tenantId)];
      const ccId = filters?.costCenterId ?? filters?.campusId;
      if (ccId !== undefined && ccId !== null && ccId !== "") {
        if (ccId === "null" || ccId === "__corporate__") {
          conditions.push(sql`${expenses.costCenterId} IS NULL`);
        } else {
          conditions.push(eq(expenses.costCenterId, ccId));
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
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .$dynamic();

      if (conditions.length > 0) query = query.where(and(...conditions));
      const limit = Math.min(filters?.limit ?? 50, 100);
      const rows = await query.limit(limit);
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        expenseDate: r.expenseDate,
        vendorName: r.vendorName,
        description: r.description,
        campusName: r.costCenterName,
        costCenterName: r.costCenterName,
        categoryName: r.categoryName,
      }));
    },

    async listPendingApprovals(costCenterId?: string | null): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tenantId)];
      if (costCenterId && costCenterId !== "null" && costCenterId !== "__corporate__") {
        conditions.push(eq(expenses.costCenterId, costCenterId));
      } else if (costCenterId === "null" || costCenterId === "__corporate__") {
        conditions.push(sql`${expenses.costCenterId} IS NULL`);
      }
      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          expenseDate: expenses.expenseDate,
          campusName: costCenters.name,
          costCenterName: costCenters.name,
          description: expenses.description,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
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
          campusName: costCenters.name,
          costCenterName: costCenters.name,
          createdAt: finJoeRoleChangeRequests.createdAt,
        })
        .from(finJoeRoleChangeRequests)
        .leftJoin(costCenters, eq(finJoeRoleChangeRequests.costCenterId, costCenters.id))
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
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
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
      return rows.map((r: Record<string, unknown>) => ({
        ...r,
        campusName: r.costCenterName,
      }));
    },

    /**
     * Semantic search via vector similarity (RAG).
     * Returns expenses ordered by cosine similarity to the query embedding.
     * Falls back to empty array if pool not provided, embedding column missing, or query fails.
     */
    async searchExpensesByEmbedding(
      queryEmbedding: number[],
      limit = 20,
      filters?: { startDate?: string; endDate?: string; campusId?: string | null }
    ): Promise<Array<Record<string, unknown>>> {
      if (!pool || !queryEmbedding || queryEmbedding.length === 0) return [];
      const vectorStr = "[" + queryEmbedding.join(",") + "]";
      const conditions = ["e.tenant_id = $1", "e.embedding IS NOT NULL"];
      const params: unknown[] = [tenantId];
      let idx = 2;
      if (filters?.startDate) {
        conditions.push(`e.expense_date >= $${idx}::date`);
        params.push(filters.startDate);
        idx++;
      }
      if (filters?.endDate) {
        conditions.push(`e.expense_date <= $${idx}::date`);
        params.push(filters.endDate);
        idx++;
      }
      if (filters?.campusId !== undefined && filters?.campusId !== null && filters?.campusId !== "") {
        if (filters.campusId === "null") {
          conditions.push("e.cost_center_id IS NULL");
        } else {
          conditions.push(`e.cost_center_id = $${idx}`);
          params.push(filters.campusId);
          idx++;
        }
      }
      params.push(vectorStr, limit);
      const vectorParam = idx;
      const limitParam = idx + 1;
      const whereClause = conditions.join(" AND ");
      try {
        const query = `
          SELECT e.id, e.amount, e.status, e.vendor_name, e.invoice_number, e.description,
            c.name as cost_center_name, ec.name as category_name
          FROM expenses e
          LEFT JOIN cost_centers c ON e.cost_center_id = c.id
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          WHERE ${whereClause}
          ORDER BY e.embedding <=> $${vectorParam}::vector
          LIMIT $${limitParam}
        `;
        const result = await pool.query(query, params);
        const rawRows = result?.rows ?? [];
        return rawRows.map((r: Record<string, unknown>) => ({
          ...r,
          campusName: r.cost_center_name,
          costCenterName: r.cost_center_name,
          categoryName: r.category_name,
        }));
      } catch {
        return [];
      }
    },

    async getExpenseSummary(filters?: {
      startDate?: string;
      endDate?: string;
      costCenterId?: string | null;
      campusId?: string | null;
      groupBy?: "status" | "campus" | "category";
    }): Promise<Record<string, unknown>> {
      const conditions = [eq(expenses.tenantId, tenantId)];
      if (filters?.startDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.startDate}::date`);
      if (filters?.endDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.endDate}::date`);
      const ccId = filters?.costCenterId ?? filters?.campusId;
      if (ccId !== undefined && ccId !== null && ccId !== "" && ccId !== "__corporate__") {
        if (ccId === "null") {
          conditions.push(sql`${expenses.costCenterId} IS NULL`);
        } else {
          conditions.push(eq(expenses.costCenterId, ccId));
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const baseQuery = db.select().from(expenses).$dynamic();
      const allRows = whereClause ? await baseQuery.where(whereClause) : await baseQuery;

      const totalAmount = (allRows as Array<{ amount?: number }>).reduce((sum: number, r) => sum + (r.amount ?? 0), 0);
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

    async getDashboardSummary(filters?: {
      startDate?: string;
      endDate?: string;
      campusId?: string | null;
    }): Promise<{
      totalExpenses: number;
      totalIncome: number;
      netCashflow: number;
      pendingApprovals: number;
      pendingRoleRequests: number;
      expenseCount: number;
      incomeCount: number;
    }> {
      const today = new Date();
      const endDate = filters?.endDate ?? today.toISOString().slice(0, 10);
      const startDate = filters?.startDate ?? new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const conditions = [eq(expenses.tenantId, tenantId), sql`${expenses.expenseDate} >= ${startDate}::date`, sql`${expenses.expenseDate} <= ${endDate}::date`];
      const ccId = filters?.campusId ?? undefined;
      if (ccId !== undefined && ccId !== null && ccId !== "" && ccId !== "__corporate__") {
        if (ccId === "null") conditions.push(sql`${expenses.costCenterId} IS NULL`);
        else conditions.push(eq(expenses.costCenterId, ccId));
      }
      const incomeConditions = [eq(incomeRecords.tenantId, tenantId), sql`${incomeRecords.incomeDate} >= ${startDate}::date`, sql`${incomeRecords.incomeDate} <= ${endDate}::date`];
      if (ccId !== undefined && ccId !== null && ccId !== "" && ccId !== "__corporate__") {
        if (ccId === "null") incomeConditions.push(sql`${incomeRecords.costCenterId} IS NULL`);
        else incomeConditions.push(eq(incomeRecords.costCenterId, ccId));
      }

      const [expenseRows, incomeRows, approvals, roleReqs] = await Promise.all([
        db.select({ amount: expenses.amount }).from(expenses).where(and(...conditions)),
        db.select({ amount: incomeRecords.amount }).from(incomeRecords).where(and(...incomeConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(and(eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tenantId))),
        db.select({ count: sql<number>`count(*)::int` }).from(finJoeRoleChangeRequests).where(and(eq(finJoeRoleChangeRequests.status, "pending"), eq(finJoeRoleChangeRequests.tenantId, tenantId))),
      ]);

      const totalExpenses = expenseRows.reduce((s, r) => s + (r.amount ?? 0), 0);
      const totalIncome = incomeRows.reduce((s, r) => s + (r.amount ?? 0), 0);
      return {
        totalExpenses,
        totalIncome,
        netCashflow: totalIncome - totalExpenses,
        pendingApprovals: approvals[0]?.count ?? 0,
        pendingRoleRequests: roleReqs[0]?.count ?? 0,
        expenseCount: expenseRows.length,
        incomeCount: incomeRows.length,
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

    async getPettyCashSummary(costCenterId?: string | null): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(pettyCashFunds.tenantId, tenantId)];
      if (costCenterId && costCenterId !== "null" && costCenterId !== "__corporate__") conditions.push(eq(pettyCashFunds.costCenterId, costCenterId));
      let query = db
        .select({
          id: pettyCashFunds.id,
          imprestAmount: pettyCashFunds.imprestAmount,
          currentBalance: pettyCashFunds.currentBalance,
          campusName: costCenters.name,
          costCenterName: costCenters.name,
          custodianName: users.name,
        })
        .from(pettyCashFunds)
        .leftJoin(costCenters, eq(pettyCashFunds.costCenterId, costCenters.id))
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

    async createIncome(data: {
      tenantId: string;
      costCenterId: string | null;
      categoryId: string;
      amount: number;
      incomeDate: string;
      particulars?: string | null;
      incomeType?: string;
      submittedByContactPhone?: string | null;
    }): Promise<{ id: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      const [created] = await db
        .insert(incomeRecords)
        .values({
          tenantId: data.tenantId,
          costCenterId: costCenterIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          incomeDate: new Date(data.incomeDate),
          particulars: data.particulars ?? null,
          incomeType: data.incomeType ?? "other",
          source: "finjoe",
        })
        .returning({ id: incomeRecords.id });
      return created ?? null;
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
            costCenterId: data.costCenterId ?? null,
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
          costCenterId: reqRow.costCenterId,
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

    // Recurring expense templates
    async createRecurringTemplate(data: CreateRecurringTemplateInput): Promise<{ id: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      const nextRunDate = computeNextRunDate(data.startDate, data.frequency, data.dayOfMonth, data.dayOfWeek);
      if (!nextRunDate) return null;
      const [created] = await db
        .insert(recurringExpenseTemplates)
        .values({
          tenantId: data.tenantId,
          costCenterId: costCenterIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          description: data.description ?? null,
          vendorName: data.vendorName ?? null,
          frequency: data.frequency,
          dayOfMonth: data.dayOfMonth ?? null,
          dayOfWeek: data.dayOfWeek ?? null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          nextRunDate: new Date(nextRunDate),
          createdById: data.createdById ?? null,
        })
        .returning({ id: recurringExpenseTemplates.id });
      return created ?? null;
    },

    async listRecurringTemplates(filters?: { isActive?: boolean }): Promise<Array<Record<string, unknown>>> {
      const conditions = [eq(recurringExpenseTemplates.tenantId, tenantId)];
      if (filters?.isActive !== undefined) conditions.push(eq(recurringExpenseTemplates.isActive, filters.isActive));
      const rows = await db
        .select({
          id: recurringExpenseTemplates.id,
          amount: recurringExpenseTemplates.amount,
          description: recurringExpenseTemplates.description,
          vendorName: recurringExpenseTemplates.vendorName,
          frequency: recurringExpenseTemplates.frequency,
          dayOfMonth: recurringExpenseTemplates.dayOfMonth,
          dayOfWeek: recurringExpenseTemplates.dayOfWeek,
          startDate: recurringExpenseTemplates.startDate,
          endDate: recurringExpenseTemplates.endDate,
          isActive: recurringExpenseTemplates.isActive,
          nextRunDate: recurringExpenseTemplates.nextRunDate,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(recurringExpenseTemplates)
        .leftJoin(costCenters, eq(recurringExpenseTemplates.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(recurringExpenseTemplates.categoryId, expenseCategories.id))
        .where(and(...conditions))
        .orderBy(recurringExpenseTemplates.nextRunDate);
      return rows.map((r: Record<string, unknown>) => ({
        ...r,
        campusName: r.costCenterName,
      }));
    },

    async updateRecurringTemplate(
      id: string,
      updates: Partial<{
        amount: number;
        description: string | null;
        vendorName: string | null;
        frequency: "monthly" | "weekly" | "quarterly";
        dayOfMonth: number | null;
        dayOfWeek: number | null;
        endDate: string | null;
        isActive: boolean;
      }>
    ): Promise<{ id: string } | null> {
      const [existing] = await db
        .select({ startDate: recurringExpenseTemplates.startDate, frequency: recurringExpenseTemplates.frequency, dayOfMonth: recurringExpenseTemplates.dayOfMonth, dayOfWeek: recurringExpenseTemplates.dayOfWeek })
        .from(recurringExpenseTemplates)
        .where(and(eq(recurringExpenseTemplates.id, id), eq(recurringExpenseTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing) return null;

      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.amount !== undefined) setValues.amount = updates.amount;
      if (updates.description !== undefined) setValues.description = updates.description;
      if (updates.vendorName !== undefined) setValues.vendorName = updates.vendorName;
      if (updates.frequency !== undefined) setValues.frequency = updates.frequency;
      if (updates.dayOfMonth !== undefined) setValues.dayOfMonth = updates.dayOfMonth;
      if (updates.dayOfWeek !== undefined) setValues.dayOfWeek = updates.dayOfWeek;
      if (updates.endDate !== undefined) setValues.endDate = updates.endDate ? new Date(updates.endDate) : null;
      if (updates.isActive !== undefined) setValues.isActive = updates.isActive;

      const freq = (updates.frequency ?? existing.frequency) as "monthly" | "weekly" | "quarterly";
      const dom = updates.dayOfMonth ?? existing.dayOfMonth;
      const dow = updates.dayOfWeek ?? existing.dayOfWeek;
      const nextRun = computeNextRunDate(
        existing.startDate instanceof Date ? existing.startDate.toISOString().slice(0, 10) : String(existing.startDate),
        freq,
        dom ?? undefined,
        dow ?? undefined
      );
      if (nextRun) setValues.nextRunDate = new Date(nextRun);

      const [updated] = await db
        .update(recurringExpenseTemplates)
        .set(setValues as Record<string, unknown>)
        .where(eq(recurringExpenseTemplates.id, id))
        .returning({ id: recurringExpenseTemplates.id });
      return updated ?? null;
    },

    async deleteRecurringTemplate(id: string): Promise<boolean> {
      const [existing] = await db
        .select()
        .from(recurringExpenseTemplates)
        .where(and(eq(recurringExpenseTemplates.id, id), eq(recurringExpenseTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing) return false;
      await db.delete(recurringExpenseTemplates).where(eq(recurringExpenseTemplates.id, id));
      return true;
    },

    async getTemplatesDueForRun(today: string): Promise<Array<Record<string, unknown>>> {
      const rows = await db
        .select()
        .from(recurringExpenseTemplates)
        .where(
          and(
            eq(recurringExpenseTemplates.tenantId, tenantId),
            eq(recurringExpenseTemplates.isActive, true),
            sql`${recurringExpenseTemplates.nextRunDate}::date <= ${today}::date`,
            sql`${recurringExpenseTemplates.startDate}::date <= ${today}::date`
          )
        );
      const todayDate = new Date(today);
      const endDateFiltered = rows.filter((r) => {
        if (!r.endDate) return true;
        const end = r.endDate instanceof Date ? r.endDate : new Date(r.endDate as string);
        return end >= todayDate;
      });
      return endDateFiltered;
    },
  };
}

/** Compute the first/next run date from a reference date given frequency and day constraints */
function computeNextRunDate(
  fromDate: string,
  frequency: "monthly" | "weekly" | "quarterly",
  dayOfMonth?: number,
  dayOfWeek?: number
): string | null {
  const d = new Date(fromDate + "T12:00:00Z");
  if (isNaN(d.getTime())) return null;

  if (frequency === "weekly") {
    const targetDow = dayOfWeek ?? 1; // default Monday
    const currentDow = d.getDay();
    let diff = targetDow - currentDow;
    if (diff < 0) diff += 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  if (frequency === "monthly") {
    const dom = dayOfMonth ?? 1;
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const targetDay = Math.min(dom, lastDay);
    const candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), targetDay));
    if (candidate >= d) return candidate.toISOString().slice(0, 10);
    const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const nextLastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
    const nextTargetDay = Math.min(dom, nextLastDay);
    return new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), nextTargetDay)).toISOString().slice(0, 10);
  }

  if (frequency === "quarterly") {
    const dom = dayOfMonth ?? 1;
    const q1 = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 2, 1));
    const lastDay = new Date(Date.UTC(q1.getUTCFullYear(), q1.getUTCMonth() + 1, 0)).getUTCDate();
    const targetDay = Math.min(dom, lastDay);
    const candidate = new Date(Date.UTC(q1.getUTCFullYear(), q1.getUTCMonth(), targetDay));
    if (candidate >= d) return candidate.toISOString().slice(0, 10);
    const nextQ = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 1));
    const nextLastDay = new Date(Date.UTC(nextQ.getUTCFullYear(), nextQ.getUTCMonth() + 1, 0)).getUTCDate();
    const nextTargetDay = Math.min(dom, nextLastDay);
    return new Date(Date.UTC(nextQ.getUTCFullYear(), nextQ.getUTCMonth(), nextTargetDay)).toISOString().slice(0, 10);
  }

  return null;
}

/** Advance nextRunDate to the next occurrence after a run */
export function advanceRecurringNextRun(
  currentNextRun: string,
  frequency: "monthly" | "weekly" | "quarterly",
  dayOfMonth?: number,
  dayOfWeek?: number
): string | null {
  const d = new Date(currentNextRun + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1); // advance by 1 day so we get the *next* occurrence
  return computeNextRunDate(d.toISOString().slice(0, 10), frequency, dayOfMonth, dayOfWeek);
}

export type FinJoeData = ReturnType<typeof createFinJoeData>;

/** Run recurring expense generation for all tenants. Call from scheduled job. */
export async function generateExpensesFromTemplates(
  db: FinJoeDb,
  today: string,
  pool?: FinJoeDataPool
): Promise<{ generated: number; errors: string[] }> {
  const tenantRows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isActive, true));
  let generated = 0;
  const errors: string[] = [];

  for (const { id: tenantId } of tenantRows) {
    const finJoeData = createFinJoeData(db, tenantId, pool);
    const templates = await finJoeData.getTemplatesDueForRun(today);

    for (const tpl of templates) {
      try {
        const templateId = tpl.id as string;
        const costCenterId = tpl.costCenterId as string | null;
        const categoryId = tpl.categoryId as string;
        const amount = tpl.amount as number;
        const description = (tpl.description as string) ?? `Recurring: ${tpl.vendorName ?? "Template"}`;
        const vendorName = tpl.vendorName as string | null;
        const frequency = tpl.frequency as "monthly" | "weekly" | "quarterly";
        const dayOfMonth = tpl.dayOfMonth as number | null;
        const dayOfWeek = tpl.dayOfWeek as number | null;
        const nextRunStr = tpl.nextRunDate instanceof Date ? tpl.nextRunDate.toISOString().slice(0, 10) : String(tpl.nextRunDate).slice(0, 10);

        const expense = await finJoeData.createExpense({
          tenantId,
          costCenterId,
          categoryId,
          amount,
          expenseDate: nextRunStr,
          description,
          vendorName,
          source: "recurring_template",
          recurringTemplateId: templateId,
        });

        if (expense?.id) {
          generated++;
          const nextRun = advanceRecurringNextRun(nextRunStr, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
          if (nextRun) {
            await db
              .update(recurringExpenseTemplates)
              .set({ nextRunDate: new Date(nextRun), updatedAt: new Date() })
              .where(eq(recurringExpenseTemplates.id, templateId));
          }
        }
      } catch (err) {
        errors.push(`Template ${tpl.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { generated, errors };
}
