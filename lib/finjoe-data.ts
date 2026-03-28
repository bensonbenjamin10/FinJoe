/**
 * FinJoe data layer - direct DB access for FinJoe service.
 */

import { eq, and, desc, sql, or, isNull, aliasedTable } from "drizzle-orm";
import { embedExpenseText } from "./expense-embeddings.js";
import { isFullUuid, toShortExpenseId } from "./expense-id.js";
import {
  bankTransactions,
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
  recurringIncomeTemplates,
  tenants,
  vendors,
} from "../shared/schema";
import { findOrCreateVendorByName } from "./vendors.js";

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
  requireConfirmationBeforePost: boolean;
  requireAuditFieldsAboveAmount: number | null;
  askOptionalFields: boolean;
};

const AUDIT_REQUIREMENTS: AuditRequirements = {
  required: ["invoiceNumber", "invoiceDate", "vendorName"],
  optional: ["gstin", "taxType"],
  gstinFormat: "15 characters",
  taxTypes: ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"],
};

/** Normalize DB date (Date, string, or raw days-since-2000 number from PostgreSQL DATE) to YYYY-MM-DD string */
function toDateString(val: unknown): string | null {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  if (typeof val === "string" && /^\d+$/.test(val)) {
    const n = parseInt(val, 10);
    if (n < 100000) {
      const d = new Date(Date.UTC(2000, 0, 1));
      d.setUTCDate(d.getUTCDate() + n);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = n < 10000000000 ? new Date(n * 1000) : new Date(n);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof val === "number") {
    if (val < 100000) {
      const d = new Date(Date.UTC(2000, 0, 1));
      d.setUTCDate(d.getUTCDate() + val);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = val < 10000000000 ? new Date(val * 1000) : new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

export type CreateExpenseInput = {
  tenantId: string;
  costCenterId: string | null;
  categoryId: string;
  amount: number;
  expenseDate: string;
  description?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  /** Resolved vendor row; if omitted, derived from vendorName via findOrCreateVendorByName. */
  vendorId?: string | null;
  vendorName?: string | null;
  gstin?: string | null;
  taxType?: string | null;
  /** Tax base in paise (optional). */
  baseAmount?: number | null;
  /** Tax amount in paise (optional). */
  taxAmount?: number | null;
  /** Whole percent 0–100 (optional). */
  taxRate?: number | null;
  voucherNumber?: string | null;
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
  gstin?: string | null;
  taxType?: string | null;
  invoiceNumber?: string | null;
  voucherNumber?: string | null;
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
        requireConfirmationBeforePost: settings.requireConfirmationBeforePost ?? false,
        requireAuditFieldsAboveAmount: settings.requireAuditFieldsAboveAmount ?? null,
        askOptionalFields: settings.askOptionalFields ?? false,
      };
    },

    async createExpense(data: CreateExpenseInput): Promise<{ id: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      let vendorId = data.vendorId ?? null;
      if (!vendorId && data.vendorName?.trim()) {
        vendorId = await findOrCreateVendorByName(db, data.tenantId, data.vendorName, data.gstin);
      }
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
          vendorId,
          vendorName: data.vendorName ?? null,
          gstin: data.gstin ?? null,
          taxType: data.taxType ?? null,
          baseAmount: data.baseAmount ?? null,
          taxAmount: data.taxAmount ?? null,
          taxRate: data.taxRate ?? null,
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

    /**
     * Resolve expense ID from full UUID or short form (last 6-12 hex chars).
     * Returns full UUID if single match, null if none or ambiguous.
     */
    async resolveExpenseId(input: string): Promise<string | null> {
      const trimmed = (input ?? "").trim();
      if (!trimmed) return null;

      if (isFullUuid(trimmed)) {
        const normalized = trimmed.toLowerCase();
        const existing = await this.getExpense(normalized);
        return existing ? normalized : null;
      }

      const shortForm = trimmed.toLowerCase();
      if (!/^[0-9a-f]{6,12}$/.test(shortForm)) return null;

      const suffix = "%" + shortForm;
      const rows = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.tenantId, tenantId),
            sql`REPLACE(${expenses.id}::text, '-', '') LIKE ${suffix}`
          )
        )
        .limit(2);
      if (rows.length !== 1) return null;
      return rows[0].id;
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
        vendorId?: string | null;
        vendorName?: string | null;
        gstin?: string | null;
        taxType?: string | null;
        baseAmount?: number | null;
        taxAmount?: number | null;
        taxRate?: number | null;
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
      if (updates.vendorId !== undefined) setValues.vendorId = updates.vendorId;
      if (updates.gstin !== undefined) setValues.gstin = updates.gstin;
      if (updates.vendorName !== undefined) {
        setValues.vendorName = updates.vendorName;
        if (updates.vendorName?.trim()) {
          const [cur] = await db.select({ gstin: expenses.gstin }).from(expenses).where(eq(expenses.id, id)).limit(1);
          const gstForVendor = updates.gstin !== undefined ? updates.gstin : cur?.gstin;
          const vid = await findOrCreateVendorByName(db, tenantId, updates.vendorName, gstForVendor);
          setValues.vendorId = vid;
        } else {
          setValues.vendorId = null;
        }
      } else if (updates.gstin !== undefined) {
        const [row] = await db.select({ vendorName: expenses.vendorName }).from(expenses).where(eq(expenses.id, id)).limit(1);
        if (row?.vendorName?.trim()) {
          const vid = await findOrCreateVendorByName(db, tenantId, row.vendorName, updates.gstin);
          setValues.vendorId = vid;
        }
      }
      if (updates.taxType !== undefined) setValues.taxType = updates.taxType;
      if (updates.baseAmount !== undefined) setValues.baseAmount = updates.baseAmount;
      if (updates.taxAmount !== undefined) setValues.taxAmount = updates.taxAmount;
      if (updates.taxRate !== undefined) setValues.taxRate = updates.taxRate;

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
      const submitterTable = aliasedTable(users, "submitter");
      const approverTable = aliasedTable(users, "approver");
      const matcherTable = aliasedTable(users, "matcher");

      const [row] = await db
        .select()
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(submitterTable, eq(expenses.submittedById, submitterTable.id))
        .leftJoin(approverTable, eq(expenses.approvedById, approverTable.id))
        .leftJoin(bankTransactions, eq(expenses.id, bankTransactions.matchedExpenseId))
        .leftJoin(matcherTable, eq(bankTransactions.matchedById, matcherTable.id))
        .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
        .limit(1);
      if (!row?.expenses) return null;
      const costCenter = (row as Record<string, unknown>).costCenters as { id: string; name: string; slug: string } | null | undefined;
      return {
        ...row.expenses,
        campus: costCenter ? { id: costCenter.id, name: costCenter.name, slug: costCenter.slug } : null,
        costCenter: costCenter ? { id: costCenter.id, name: costCenter.name, slug: costCenter.slug } : null,
        category: row.expense_categories ? { id: row.expense_categories.id, name: row.expense_categories.name, slug: row.expense_categories.slug } : null,
        submittedByName: row.submitter ? row.submitter.name : null,
        approvedByName: row.approver ? row.approver.name : null,
        matchedByName: row.matcher ? row.matcher.name : null,
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
      const submitterTable = aliasedTable(users, "submitter");
      const approverTable = aliasedTable(users, "approver");
      const matcherTable = aliasedTable(users, "matcher");

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
          submittedByName: submitterTable.name,
          approvedByName: approverTable.name,
          matchedByName: matcherTable.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(submitterTable, eq(expenses.submittedById, submitterTable.id))
        .leftJoin(approverTable, eq(expenses.approvedById, approverTable.id))
        .leftJoin(bankTransactions, eq(expenses.id, bankTransactions.matchedExpenseId))
        .leftJoin(matcherTable, eq(bankTransactions.matchedById, matcherTable.id))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .$dynamic();

      if (conditions.length > 0) query = query.where(and(...conditions));
      const limit = Math.min(filters?.limit ?? 50, 100);
      const rows = await query.limit(limit);
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        shortId: toShortExpenseId(r.id as string),
        amount: r.amount,
        status: r.status,
        expenseDate: r.expenseDate,
        vendorName: r.vendorName,
        description: r.description,
        campusName: r.costCenterName,
        costCenterName: r.costCenterName,
        categoryName: r.categoryName,
        submittedByName: r.submittedByName,
        approvedByName: r.approvedByName,
        matchedByName: r.matchedByName,
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
      return rows.map((r: Record<string, unknown>) => ({ ...r, shortId: toShortExpenseId(r.id as string) }));
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

    async searchExpenses(
      query: string,
      limit = 20,
      filters?: { startDate?: string; endDate?: string; campusId?: string | null; categoryId?: string }
    ): Promise<Array<Record<string, unknown>>> {
      const q = query.trim();
      if (!q) return [];
      const pattern = `%${q}%`;
      const submitterTable = aliasedTable(users, "submitter");
      const approverTable = aliasedTable(users, "approver");
      const matcherTable = aliasedTable(users, "matcher");

      const conditions = [eq(expenses.tenantId, tenantId)];
      if (filters?.startDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.startDate}::date`);
      if (filters?.endDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.endDate}::date`);
      if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
      if (filters?.campusId !== undefined && filters?.campusId !== null && filters?.campusId !== "") {
        if (filters.campusId === "null" || filters.campusId === "__corporate__") {
          conditions.push(sql`${expenses.costCenterId} IS NULL`);
        } else {
          conditions.push(eq(expenses.costCenterId, filters.campusId));
        }
      }
      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          status: expenses.status,
          expenseDate: expenses.expenseDate,
          vendorName: expenses.vendorName,
          invoiceNumber: expenses.invoiceNumber,
          description: expenses.description,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          submittedByName: submitterTable.name,
          approvedByName: approverTable.name,
          matchedByName: matcherTable.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(submitterTable, eq(expenses.submittedById, submitterTable.id))
        .leftJoin(approverTable, eq(expenses.approvedById, approverTable.id))
        .leftJoin(bankTransactions, eq(expenses.id, bankTransactions.matchedExpenseId))
        .leftJoin(matcherTable, eq(bankTransactions.matchedById, matcherTable.id))
        .where(
          and(
            ...conditions,
            or(
              sql`${expenses.vendorName}::text ILIKE ${pattern}`,
              sql`${expenses.invoiceNumber}::text ILIKE ${pattern}`,
              sql`${expenses.description}::text ILIKE ${pattern}`,
              sql`${expenses.particulars}::text ILIKE ${pattern}`
            )
          )
        )
        .orderBy(desc(expenses.expenseDate))
        .limit(limit);
      return rows.map((r: Record<string, unknown>) => ({
        ...r,
        campusName: r.costCenterName,
        shortId: toShortExpenseId(r.id as string),
        submittedByName: r.submittedByName,
        approvedByName: r.approvedByName,
        matchedByName: r.matchedByName,
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
          SELECT e.id, e.amount, e.status, e.expense_date, e.vendor_name, e.invoice_number, e.description,
            c.name as cost_center_name, ec.name as category_name,
            sub.name as submitted_by_name, app.name as approved_by_name, mat.name as matched_by_name
          FROM expenses e
          LEFT JOIN cost_centers c ON e.cost_center_id = c.id
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          LEFT JOIN users sub ON e.submitted_by_id = sub.id
          LEFT JOIN users app ON e.approved_by_id = app.id
          LEFT JOIN bank_transactions bt ON e.id = bt.matched_expense_id
          LEFT JOIN users mat ON bt.matched_by_id = mat.id
          WHERE ${whereClause}
          ORDER BY e.embedding <=> $${vectorParam}::vector
          LIMIT $${limitParam}
        `;
        const result = await pool.query(query, params);
        const rawRows = result?.rows ?? [];
        return rawRows.map((r: Record<string, unknown>) => ({
          ...r,
          expenseDate: r.expense_date,
          campusName: r.cost_center_name,
          costCenterName: r.cost_center_name,
          categoryName: r.category_name,
          shortId: toShortExpenseId(r.id as string),
          submittedByName: r.submitted_by_name,
          approvedByName: r.approved_by_name,
          matchedByName: r.matched_by_name,
        }));
      } catch (err) {
        console.error("[finjoe-data] searchExpensesByEmbedding failed", err);
        return [];
      }
    },

    async getExpenseSummary(filters?: {
      startDate?: string;
      endDate?: string;
      costCenterId?: string | null;
      campusId?: string | null;
      categoryId?: string;
      groupBy?: "status" | "campus" | "category";
    }): Promise<Record<string, unknown>> {
      const conditions = [eq(expenses.tenantId, tenantId)];
      if (filters?.startDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.startDate}::date`);
      if (filters?.endDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.endDate}::date`);
      if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
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

      const totalExpenses = expenseRows.reduce((s: number, r: { amount: number | null }) => s + (r.amount ?? 0), 0);
      const totalIncome = incomeRows.reduce((s: number, r: { amount: number | null }) => s + (r.amount ?? 0), 0);
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

    async approveExpense(id: string, approvedById: string): Promise<{
      id: string;
      submittedByContactPhone?: string | null;
      amount?: number | null;
      vendorName?: string | null;
      description?: string | null;
      costCenterName?: string | null;
      categoryName?: string | null;
    } | null> {
      const [existing] = await db
        .select({
          status: expenses.status,
          submittedByContactPhone: expenses.submittedByContactPhone,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          description: expenses.description,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
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
      return updated ? {
        ...updated,
        submittedByContactPhone: existing.submittedByContactPhone,
        amount: existing.amount,
        vendorName: existing.vendorName,
        description: existing.description,
        costCenterName: existing.costCenterName,
        categoryName: existing.categoryName,
      } : null;
    },

    async rejectExpense(id: string, approvedById: string, reason: string): Promise<{
      id: string;
      submittedByContactPhone?: string | null;
      amount?: number | null;
      vendorName?: string | null;
      description?: string | null;
      costCenterName?: string | null;
      categoryName?: string | null;
    } | null> {
      const [existing] = await db
        .select({
          status: expenses.status,
          submittedByContactPhone: expenses.submittedByContactPhone,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          description: expenses.description,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
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
      return updated ? {
        ...updated,
        submittedByContactPhone: existing.submittedByContactPhone,
        amount: existing.amount,
        vendorName: existing.vendorName,
        description: existing.description,
        costCenterName: existing.costCenterName,
        categoryName: existing.categoryName,
      } : null;
    },

    async recordExpensePayout(
      id: string,
      payoutMethod: string,
      payoutRef: string
    ): Promise<{
      id: string;
      amount?: number | null;
      vendorName?: string | null;
      costCenterName?: string | null;
      categoryName?: string | null;
      submittedByContactPhone?: string | null;
      actualPayoutMethod?: string;
    } | null> {
      const validMethods = ["bank_transfer", "upi", "cash", "cheque", "demand_draft"];
      if (!validMethods.includes(payoutMethod)) {
        return null;
      }
      const [existing] = await db
        .select({
          status: expenses.status,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          submittedByContactPhone: expenses.submittedByContactPhone,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(eq(expenses.id, id))
        .limit(1);
      if (!existing) return null;
      if (existing.status !== "approved") return null;

      const [updated] = await db
        .update(expenses)
        .set({
          status: "paid",
          payoutMethod,
          payoutRef: payoutRef || "marked via FinJoe WhatsApp",
          payoutAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      return updated ? {
        ...updated,
        amount: existing.amount,
        vendorName: existing.vendorName,
        costCenterName: existing.costCenterName,
        categoryName: existing.categoryName,
        submittedByContactPhone: existing.submittedByContactPhone,
        actualPayoutMethod: payoutMethod,
      } : null;
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
      source?: string;
      recurringTemplateId?: string | null;
      recordedById?: string | null;
      razorpayPaymentId?: string | null;
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
          source: data.source ?? "finjoe",
          recurringTemplateId: data.recurringTemplateId ?? null,
          recordedById: data.recordedById ?? null,
          razorpayPaymentId: data.razorpayPaymentId ?? null,
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
    async createRecurringTemplate(data: CreateRecurringTemplateInput): Promise<{ id: string } | { error: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      const nextRunDate = computeNextRunDate(data.startDate, data.frequency, data.dayOfMonth, data.dayOfWeek);
      if (!nextRunDate || nextRunDate < "2022-01-01") {
        return { error: "startDate must be 2022 or later. The computed next run date would be in the past." };
      }
      let vendorId: string | null = null;
      if (data.vendorName?.trim()) {
        vendorId = await findOrCreateVendorByName(db, data.tenantId, data.vendorName, data.gstin);
      }
      const [created] = await db
        .insert(recurringExpenseTemplates)
        .values({
          tenantId: data.tenantId,
          costCenterId: costCenterIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          description: data.description ?? null,
          vendorId,
          vendorName: data.vendorName ?? null,
          gstin: data.gstin ?? null,
          taxType: data.taxType ?? null,
          invoiceNumber: data.invoiceNumber ?? null,
          voucherNumber: data.voucherNumber ?? null,
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
      const creatorTable = aliasedTable(users, "creator");
      const updaterTable = aliasedTable(users, "updater");
      const conditions = [eq(recurringExpenseTemplates.tenantId, tenantId)];
      if (filters?.isActive !== undefined) conditions.push(eq(recurringExpenseTemplates.isActive, filters.isActive));
      const rows = await db
        .select({
          id: recurringExpenseTemplates.id,
          costCenterId: recurringExpenseTemplates.costCenterId,
          categoryId: recurringExpenseTemplates.categoryId,
          amount: recurringExpenseTemplates.amount,
          description: recurringExpenseTemplates.description,
          vendorId: recurringExpenseTemplates.vendorId,
          vendorName: recurringExpenseTemplates.vendorName,
          gstin: recurringExpenseTemplates.gstin,
          taxType: recurringExpenseTemplates.taxType,
          invoiceNumber: recurringExpenseTemplates.invoiceNumber,
          voucherNumber: recurringExpenseTemplates.voucherNumber,
          frequency: recurringExpenseTemplates.frequency,
          dayOfMonth: recurringExpenseTemplates.dayOfMonth,
          dayOfWeek: recurringExpenseTemplates.dayOfWeek,
          startDate: recurringExpenseTemplates.startDate,
          endDate: recurringExpenseTemplates.endDate,
          isActive: recurringExpenseTemplates.isActive,
          nextRunDate: sql<string>`${recurringExpenseTemplates.nextRunDate}::text`.as("nextRunDate"),
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          createdById: recurringExpenseTemplates.createdById,
          updatedById: recurringExpenseTemplates.updatedById,
          createdByName: creatorTable.name,
          updatedByName: updaterTable.name,
        })
        .from(recurringExpenseTemplates)
        .leftJoin(costCenters, eq(recurringExpenseTemplates.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(recurringExpenseTemplates.categoryId, expenseCategories.id))
        .leftJoin(creatorTable, eq(recurringExpenseTemplates.createdById, creatorTable.id))
        .leftJoin(updaterTable, eq(recurringExpenseTemplates.updatedById, updaterTable.id))
        .where(and(...conditions))
        .orderBy(recurringExpenseTemplates.nextRunDate);
      return rows.map((r: Record<string, unknown>) => ({
        ...r,
        nextRunDate: toDateString(r.nextRunDate) ?? r.nextRunDate,
        campusName: r.costCenterName,
      }));
    },

    async updateRecurringTemplate(
      id: string,
      updates: Partial<{
        amount: number;
        description: string | null;
        vendorName: string | null;
        gstin: string | null;
        taxType: string | null;
        invoiceNumber: string | null;
        voucherNumber: string | null;
        frequency: "monthly" | "weekly" | "quarterly";
        dayOfMonth: number | null;
        dayOfWeek: number | null;
        endDate: string | null;
        isActive: boolean;
        updatedById: string | null;
      }>
    ): Promise<{ id: string } | null> {
      const [existing] = await db
        .select({
          startDate: recurringExpenseTemplates.startDate,
          nextRunDate: recurringExpenseTemplates.nextRunDate,
          frequency: recurringExpenseTemplates.frequency,
          dayOfMonth: recurringExpenseTemplates.dayOfMonth,
          dayOfWeek: recurringExpenseTemplates.dayOfWeek,
        })
        .from(recurringExpenseTemplates)
        .where(and(eq(recurringExpenseTemplates.id, id), eq(recurringExpenseTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing) return null;

      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.amount !== undefined) setValues.amount = updates.amount;
      if (updates.description !== undefined) setValues.description = updates.description;
      if (updates.gstin !== undefined) setValues.gstin = updates.gstin;
      if (updates.vendorName !== undefined) {
        setValues.vendorName = updates.vendorName;
        if (updates.vendorName?.trim()) {
          const [cur] = await db.select({ gstin: recurringExpenseTemplates.gstin }).from(recurringExpenseTemplates).where(eq(recurringExpenseTemplates.id, id)).limit(1);
          const gstForVendor = updates.gstin !== undefined ? updates.gstin : cur?.gstin;
          const vid = await findOrCreateVendorByName(db, tenantId, updates.vendorName, gstForVendor);
          setValues.vendorId = vid;
        } else {
          setValues.vendorId = null;
        }
      } else if (updates.gstin !== undefined) {
        const [row] = await db.select({ vendorName: recurringExpenseTemplates.vendorName }).from(recurringExpenseTemplates).where(eq(recurringExpenseTemplates.id, id)).limit(1);
        if (row?.vendorName?.trim()) {
          const vid = await findOrCreateVendorByName(db, tenantId, row.vendorName, updates.gstin);
          setValues.vendorId = vid;
        }
      }
      if (updates.taxType !== undefined) setValues.taxType = updates.taxType;
      if (updates.invoiceNumber !== undefined) setValues.invoiceNumber = updates.invoiceNumber;
      if (updates.voucherNumber !== undefined) setValues.voucherNumber = updates.voucherNumber;
      if (updates.frequency !== undefined) setValues.frequency = updates.frequency;
      if (updates.dayOfMonth !== undefined) setValues.dayOfMonth = updates.dayOfMonth;
      if (updates.dayOfWeek !== undefined) setValues.dayOfWeek = updates.dayOfWeek;
      if (updates.endDate !== undefined) setValues.endDate = updates.endDate ? new Date(updates.endDate) : null;
      if (updates.isActive !== undefined) setValues.isActive = updates.isActive;
      if (updates.updatedById !== undefined) setValues.updatedById = updates.updatedById;

      // Only recompute nextRunDate when schedule changed (frequency/day). Use today as fromDate so we get the next occurrence from now, not from startDate (which would reset to past dates).
      const scheduleChanged =
        updates.frequency !== undefined || updates.dayOfMonth !== undefined || updates.dayOfWeek !== undefined;
      if (scheduleChanged) {
        const freq = (updates.frequency ?? existing.frequency) as "monthly" | "weekly" | "quarterly";
        const dom = updates.dayOfMonth ?? existing.dayOfMonth;
        const dow = updates.dayOfWeek ?? existing.dayOfWeek;
        const todayStr = new Date().toISOString().slice(0, 10);
        const nextRun = computeNextRunDate(todayStr, freq, dom ?? undefined, dow ?? undefined);
        if (nextRun) setValues.nextRunDate = new Date(nextRun);
      }

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

    async listBankTransactions(filters?: { status?: string, limit?: number }): Promise<Array<Record<string, unknown>>> {
      const matcherTable = aliasedTable(users, "matcher");
      const conditions = [eq(bankTransactions.tenantId, tenantId)];
      if (filters?.status) conditions.push(eq(bankTransactions.reconciliationStatus, filters.status));
      const rows = await db
        .select({
          id: bankTransactions.id,
          transactionDate: bankTransactions.transactionDate,
          particulars: bankTransactions.particulars,
          amount: bankTransactions.amount,
          type: bankTransactions.type,
          reconciliationStatus: bankTransactions.reconciliationStatus,
          matchedExpenseId: bankTransactions.matchedExpenseId,
          matchedIncomeId: bankTransactions.matchedIncomeId,
          matchConfidence: bankTransactions.matchConfidence,
          matchedAt: bankTransactions.matchedAt,
          matchedByName: matcherTable.name,
        })
        .from(bankTransactions)
        .leftJoin(matcherTable, eq(bankTransactions.matchedById, matcherTable.id))
        .where(and(...conditions))
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(filters?.limit ?? 20);
      return rows;
    },

    async listIncomes(filters?: { limit?: number }): Promise<Array<Record<string, unknown>>> {
      const recorderTable = aliasedTable(users, "recorder");
      const conditions = [eq(incomeRecords.tenantId, tenantId)];
      const rows = await db
        .select({
          id: incomeRecords.id,
          amount: incomeRecords.amount,
          incomeDate: incomeRecords.incomeDate,
          particulars: incomeRecords.particulars,
          incomeType: incomeRecords.incomeType,
          source: incomeRecords.source,
          categoryName: incomeCategories.name,
          costCenterName: costCenters.name,
          recordedByName: recorderTable.name,
        })
        .from(incomeRecords)
        .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
        .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
        .leftJoin(recorderTable, eq(incomeRecords.recordedById, recorderTable.id))
        .where(and(...conditions))
        .orderBy(desc(incomeRecords.incomeDate))
        .limit(filters?.limit ?? 20);
      return rows;
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
      const endDateFiltered = rows.filter((r: Record<string, unknown>) => {
        if (!r.endDate) return true;
        const end = r.endDate instanceof Date ? r.endDate : new Date(r.endDate as string);
        return end >= todayDate;
      });
      return endDateFiltered;
    },

    // Recurring income templates
    async createRecurringIncomeTemplate(data: {
      tenantId: string;
      costCenterId: string | null;
      categoryId: string;
      amount: number;
      particulars?: string | null;
      incomeType?: string;
      frequency: "monthly" | "weekly" | "quarterly";
      dayOfMonth?: number;
      dayOfWeek?: number;
      startDate: string;
      endDate?: string | null;
      createdById?: string | null;
    }): Promise<{ id: string } | null> {
      const costCenterIdForDb = data.costCenterId === "__corporate__" || data.costCenterId === "null" ? null : data.costCenterId;
      const nextRunDate = computeNextRunDate(data.startDate, data.frequency, data.dayOfMonth, data.dayOfWeek);
      if (!nextRunDate || nextRunDate < "2022-01-01") return null;
      const [created] = await db
        .insert(recurringIncomeTemplates)
        .values({
          tenantId: data.tenantId,
          costCenterId: costCenterIdForDb,
          categoryId: data.categoryId,
          amount: data.amount,
          particulars: data.particulars ?? null,
          incomeType: data.incomeType ?? "other",
          frequency: data.frequency,
          dayOfMonth: data.dayOfMonth ?? null,
          dayOfWeek: data.dayOfWeek ?? null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          nextRunDate: new Date(nextRunDate),
          createdById: data.createdById ?? null,
        })
        .returning({ id: recurringIncomeTemplates.id });
      return created ?? null;
    },

    async listRecurringIncomeTemplates(filters?: { isActive?: boolean }): Promise<Array<Record<string, unknown>>> {
      const creatorTable = aliasedTable(users, "creator");
      const updaterTable = aliasedTable(users, "updater");
      const conditions = [eq(recurringIncomeTemplates.tenantId, tenantId)];
      if (filters?.isActive !== undefined) conditions.push(eq(recurringIncomeTemplates.isActive, filters.isActive));
      const rows = await db
        .select({
          id: recurringIncomeTemplates.id,
          costCenterId: recurringIncomeTemplates.costCenterId,
          categoryId: recurringIncomeTemplates.categoryId,
          amount: recurringIncomeTemplates.amount,
          particulars: recurringIncomeTemplates.particulars,
          incomeType: recurringIncomeTemplates.incomeType,
          frequency: recurringIncomeTemplates.frequency,
          dayOfMonth: recurringIncomeTemplates.dayOfMonth,
          dayOfWeek: recurringIncomeTemplates.dayOfWeek,
          startDate: recurringIncomeTemplates.startDate,
          endDate: recurringIncomeTemplates.endDate,
          isActive: recurringIncomeTemplates.isActive,
          nextRunDate: sql<string>`${recurringIncomeTemplates.nextRunDate}::text`.as("nextRunDate"),
          costCenterName: costCenters.name,
          categoryName: incomeCategories.name,
          createdById: recurringIncomeTemplates.createdById,
          updatedById: recurringIncomeTemplates.updatedById,
          createdByName: creatorTable.name,
          updatedByName: updaterTable.name,
        })
        .from(recurringIncomeTemplates)
        .leftJoin(costCenters, eq(recurringIncomeTemplates.costCenterId, costCenters.id))
        .leftJoin(incomeCategories, eq(recurringIncomeTemplates.categoryId, incomeCategories.id))
        .leftJoin(creatorTable, eq(recurringIncomeTemplates.createdById, creatorTable.id))
        .leftJoin(updaterTable, eq(recurringIncomeTemplates.updatedById, updaterTable.id))
        .where(and(...conditions))
        .orderBy(recurringIncomeTemplates.nextRunDate);
      return rows.map((r: Record<string, unknown>) => ({
        ...r,
        nextRunDate: toDateString(r.nextRunDate) ?? r.nextRunDate,
        campusName: r.costCenterName,
      }));
    },

    async updateRecurringIncomeTemplate(
      id: string,
      updates: Partial<{
        amount: number;
        particulars: string | null;
        incomeType: string;
        frequency: "monthly" | "weekly" | "quarterly";
        dayOfMonth: number | null;
        dayOfWeek: number | null;
        endDate: string | null;
        isActive: boolean;
      }>
    ): Promise<{ id: string } | null> {
      const [existing] = await db
        .select({
          startDate: recurringIncomeTemplates.startDate,
          nextRunDate: recurringIncomeTemplates.nextRunDate,
          frequency: recurringIncomeTemplates.frequency,
          dayOfMonth: recurringIncomeTemplates.dayOfMonth,
          dayOfWeek: recurringIncomeTemplates.dayOfWeek,
        })
        .from(recurringIncomeTemplates)
        .where(and(eq(recurringIncomeTemplates.id, id), eq(recurringIncomeTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing) return null;

      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.amount !== undefined) setValues.amount = updates.amount;
      if (updates.particulars !== undefined) setValues.particulars = updates.particulars;
      if (updates.incomeType !== undefined) setValues.incomeType = updates.incomeType;
      if (updates.frequency !== undefined) setValues.frequency = updates.frequency;
      if (updates.dayOfMonth !== undefined) setValues.dayOfMonth = updates.dayOfMonth;
      if (updates.dayOfWeek !== undefined) setValues.dayOfWeek = updates.dayOfWeek;
      if (updates.endDate !== undefined) setValues.endDate = updates.endDate ? new Date(updates.endDate) : null;
      if (updates.isActive !== undefined) setValues.isActive = updates.isActive;

      const scheduleChanged =
        updates.frequency !== undefined || updates.dayOfMonth !== undefined || updates.dayOfWeek !== undefined;
      if (scheduleChanged) {
        const freq = (updates.frequency ?? existing.frequency) as "monthly" | "weekly" | "quarterly";
        const dom = updates.dayOfMonth ?? existing.dayOfMonth;
        const dow = updates.dayOfWeek ?? existing.dayOfWeek;
        const todayStr = new Date().toISOString().slice(0, 10);
        const nextRun = computeNextRunDate(todayStr, freq, dom ?? undefined, dow ?? undefined);
        if (nextRun) setValues.nextRunDate = new Date(nextRun);
      }

      const [updated] = await db
        .update(recurringIncomeTemplates)
        .set(setValues as Record<string, unknown>)
        .where(eq(recurringIncomeTemplates.id, id))
        .returning({ id: recurringIncomeTemplates.id });
      return updated ?? null;
    },

    async deleteRecurringIncomeTemplate(id: string): Promise<boolean> {
      const [existing] = await db
        .select()
        .from(recurringIncomeTemplates)
        .where(and(eq(recurringIncomeTemplates.id, id), eq(recurringIncomeTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing) return false;
      await db.delete(recurringIncomeTemplates).where(eq(recurringIncomeTemplates.id, id));
      return true;
    },

    async getIncomeTemplatesDueForRun(today: string): Promise<Array<Record<string, unknown>>> {
      const rows = await db
        .select()
        .from(recurringIncomeTemplates)
        .where(
          and(
            eq(recurringIncomeTemplates.tenantId, tenantId),
            eq(recurringIncomeTemplates.isActive, true),
            sql`${recurringIncomeTemplates.nextRunDate}::date <= ${today}::date`,
            sql`${recurringIncomeTemplates.startDate}::date <= ${today}::date`
          )
        );
      const todayDate = new Date(today);
      const endDateFiltered = rows.filter((r: Record<string, unknown>) => {
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
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1); // advance by 1 day so we get the *next* occurrence
  return computeNextRunDate(d.toISOString().slice(0, 10), frequency, dayOfMonth, dayOfWeek);
}

export type FinJoeData = ReturnType<typeof createFinJoeData>;

const VENDOR_SUGGESTIONS_LIMIT = 100;

/** List distinct vendor names from expenses for autocomplete suggestions */
export async function listDistinctVendorNames(db: FinJoeDb, tenantId: string): Promise<string[]> {
  const fromVendors = await db
    .select({ name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.isActive, true)))
    .orderBy(vendors.name)
    .limit(VENDOR_SUGGESTIONS_LIMIT);
  const legacy = await db
    .selectDistinct({ vendorName: expenses.vendorName })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        isNull(expenses.vendorId),
        sql`${expenses.vendorName} IS NOT NULL AND trim(${expenses.vendorName}) <> ''`,
      ),
    )
    .orderBy(expenses.vendorName)
    .limit(VENDOR_SUGGESTIONS_LIMIT);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of fromVendors) {
    const n = (r.name as string)?.trim();
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      out.push(n);
    }
  }
  for (const r of legacy) {
    const name = (r.vendorName as string)?.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
    if (out.length >= VENDOR_SUGGESTIONS_LIMIT) break;
  }
  return out.slice(0, VENDOR_SUGGESTIONS_LIMIT);
}

/** Max expenses to create per template per run (catch-up for missed cron runs) */
const MAX_CATCH_UP_PER_TEMPLATE = 12;

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
        let nextRunStr = tpl.nextRunDate instanceof Date ? tpl.nextRunDate.toISOString().slice(0, 10) : String(tpl.nextRunDate ?? "").slice(0, 10);

        // Repair far-past nextRunDate (e.g. epoch) – persist immediately so display fixes even if we skip later
        if (nextRunStr < "2022-01-01") {
          const repaired = computeNextRunDate(today, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
          if (repaired) {
            nextRunStr = repaired;
            await db
              .update(recurringExpenseTemplates)
              .set({ nextRunDate: new Date(nextRunStr), updatedAt: new Date() })
              .where(eq(recurringExpenseTemplates.id, templateId));
          }
        }

        // Validate category and cost center exist (avoid FK violation if deleted)
        const [catExists] = await db
          .select({ id: expenseCategories.id })
          .from(expenseCategories)
          .where(and(eq(expenseCategories.id, categoryId), or(eq(expenseCategories.tenantId, tenantId), isNull(expenseCategories.tenantId)), eq(expenseCategories.isActive, true)))
          .limit(1);
        if (!catExists) {
          errors.push(`Template ${templateId}: category ${categoryId} not found or inactive`);
          continue;
        }
        if (costCenterId) {
          const [ccExists] = await db
            .select({ id: costCenters.id })
            .from(costCenters)
            .where(and(eq(costCenters.id, costCenterId), eq(costCenters.tenantId, tenantId), eq(costCenters.isActive, true)))
            .limit(1);
          if (!ccExists) {
            errors.push(`Template ${templateId}: cost center ${costCenterId} not found or inactive`);
            continue;
          }
        }

        // Catch-up: create expenses for all missed dates (nextRunDate <= today), up to MAX_CATCH_UP_PER_TEMPLATE
        let createdThisTemplate = 0;
        while (nextRunStr <= today && createdThisTemplate < MAX_CATCH_UP_PER_TEMPLATE) {
          const [existingExpense] = await db
            .select({ id: expenses.id })
            .from(expenses)
            .where(
              and(
                eq(expenses.tenantId, tenantId),
                eq(expenses.recurringTemplateId, templateId),
                sql`${expenses.expenseDate}::date = ${nextRunStr}::date`
              )
            )
            .limit(1);
          if (existingExpense) {
            const nextRun = advanceRecurringNextRun(nextRunStr, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
            if (!nextRun) break;
            nextRunStr = nextRun;
            continue;
          }

          const expense = await finJoeData.createExpense({
            tenantId,
            costCenterId,
            categoryId,
            amount,
            expenseDate: nextRunStr,
            description,
            vendorId: (tpl.vendorId as string | null | undefined) ?? undefined,
            vendorName,
            invoiceDate: nextRunStr,
            gstin: (tpl.gstin as string | null) ?? undefined,
            taxType: (tpl.taxType as string | null) ?? undefined,
            invoiceNumber: (tpl.invoiceNumber as string | null) ?? undefined,
            voucherNumber: (tpl.voucherNumber as string | null) ?? undefined,
            source: "recurring_template",
            recurringTemplateId: templateId,
          });

          if (expense?.id) {
            generated++;
            createdThisTemplate++;
          }
          const nextRun = advanceRecurringNextRun(nextRunStr, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
          if (!nextRun) break;
          nextRunStr = nextRun;
        }

        if (nextRunStr) {
          await db
            .update(recurringExpenseTemplates)
            .set({ nextRunDate: new Date(nextRunStr), updatedAt: new Date() })
            .where(eq(recurringExpenseTemplates.id, templateId));
        }
      } catch (err) {
        errors.push(`Template ${tpl.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { generated, errors };
}

/** Run recurring income generation for all tenants. Call from scheduled job. */
export async function generateIncomeFromTemplates(db: FinJoeDb, today: string): Promise<{ generated: number; errors: string[] }> {
  const tenantRows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isActive, true));
  let generated = 0;
  const errors: string[] = [];

  for (const { id: tenantId } of tenantRows) {
    const finJoeData = createFinJoeData(db, tenantId);
    const templates = await finJoeData.getIncomeTemplatesDueForRun(today);

    for (const tpl of templates) {
      try {
        const templateId = tpl.id as string;
        const costCenterId = tpl.costCenterId as string | null;
        const categoryId = tpl.categoryId as string;
        const amount = tpl.amount as number;
        const particulars = (tpl.particulars as string) ?? `Recurring income`;
        const incomeType = (tpl.incomeType as string) ?? "other";
        const frequency = tpl.frequency as "monthly" | "weekly" | "quarterly";
        const dayOfMonth = tpl.dayOfMonth as number | null;
        const dayOfWeek = tpl.dayOfWeek as number | null;
        let nextRunStr = tpl.nextRunDate instanceof Date ? tpl.nextRunDate.toISOString().slice(0, 10) : String(tpl.nextRunDate ?? "").slice(0, 10);

        // Repair far-past nextRunDate (e.g. epoch) – persist immediately so display fixes even if we skip later
        if (nextRunStr < "2022-01-01") {
          const repaired = computeNextRunDate(today, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
          if (repaired) {
            nextRunStr = repaired;
            await db
              .update(recurringIncomeTemplates)
              .set({ nextRunDate: new Date(nextRunStr), updatedAt: new Date() })
              .where(eq(recurringIncomeTemplates.id, templateId));
          }
        }

        const [catExists] = await db
          .select({ id: incomeCategories.id })
          .from(incomeCategories)
          .where(and(eq(incomeCategories.id, categoryId), eq(incomeCategories.tenantId, tenantId), eq(incomeCategories.isActive, true)))
          .limit(1);
        if (!catExists) {
          errors.push(`Income template ${templateId}: category ${categoryId} not found or inactive`);
          continue;
        }
        if (costCenterId) {
          const [ccExists] = await db
            .select({ id: costCenters.id })
            .from(costCenters)
            .where(and(eq(costCenters.id, costCenterId), eq(costCenters.tenantId, tenantId), eq(costCenters.isActive, true)))
            .limit(1);
          if (!ccExists) {
            errors.push(`Income template ${templateId}: cost center ${costCenterId} not found or inactive`);
            continue;
          }
        }

        let createdThisTemplate = 0;
        while (nextRunStr <= today && createdThisTemplate < MAX_CATCH_UP_PER_TEMPLATE) {
          const [existingIncome] = await db
            .select({ id: incomeRecords.id })
            .from(incomeRecords)
            .where(
              and(
                eq(incomeRecords.tenantId, tenantId),
                eq(incomeRecords.recurringTemplateId, templateId),
                sql`${incomeRecords.incomeDate}::date = ${nextRunStr}::date`
              )
            )
            .limit(1);
          if (existingIncome) {
            const nextRun = advanceRecurringNextRun(nextRunStr, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
            if (!nextRun) break;
            nextRunStr = nextRun;
            continue;
          }

          const income = await finJoeData.createIncome({
            tenantId,
            costCenterId,
            categoryId,
            amount,
            incomeDate: nextRunStr,
            particulars,
            incomeType,
            source: "recurring_template",
            recurringTemplateId: templateId,
          });

          if (income?.id) {
            generated++;
            createdThisTemplate++;
          }
          const nextRun = advanceRecurringNextRun(nextRunStr, frequency, dayOfMonth ?? undefined, dayOfWeek ?? undefined);
          if (!nextRun) break;
          nextRunStr = nextRun;
        }

        if (nextRunStr) {
          await db
            .update(recurringIncomeTemplates)
            .set({ nextRunDate: new Date(nextRunStr), updatedAt: new Date() })
            .where(eq(recurringIncomeTemplates.id, templateId));
        }
      } catch (err) {
        errors.push(`Income template ${tpl.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { generated, errors };
}
