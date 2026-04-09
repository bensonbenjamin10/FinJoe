/**
 * Configurable multi-step approval engine.
 *
 * Matches expenses to rules based on conditions (amount, category, cost center, etc.),
 * resolves eligible approvers per step via user_approval_scopes, and drives the
 * step-by-step approval chain.
 *
 * This module is consumed by both the HTTP server (routes.ts) and the WhatsApp
 * worker agent (agent.ts).
 */

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  approvalRules,
  approvalRuleSteps,
  userApprovalScopes,
  expenseApprovalSteps,
  expenses,
  users,
  costCenters,
  expenseCategories,
  pettyCashFunds,
  type ApprovalRule,
  type ApprovalRuleStep,
  type ExpenseApprovalStep,
} from "../shared/schema.js";

export type ApprovalEngineDb = any;

type RuleCondition = { field: string; op: string; value: unknown };

type ResolvedStep = {
  stepId: string;
  stepOrder: number;
  approverUserIds: string[];
  approverType: string;
  approverValue: string | null;
  approvalMode: string;
  canReject: boolean;
};

export type ApprovalStatus = {
  ruleId: string;
  ruleName: string;
  steps: Array<{
    id: string;
    stepOrder: number;
    status: string;
    approverType: string;
    approverValue: string | null;
    approvalMode: string;
    assignedTo: string[];
    actedById: string | null;
    actedByName: string | null;
    actedAt: Date | null;
    comment: string | null;
  }>;
  currentStepOrder: number | null;
  isFullyApproved: boolean;
  isRejected: boolean;
};

// ---------------------------------------------------------------------------
// Condition matching
// ---------------------------------------------------------------------------

function matchCondition(condition: RuleCondition, expense: Record<string, unknown>): boolean {
  const { field, op, value } = condition;
  const actual = expense[field];

  switch (op) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "gte":
      return typeof actual === "number" && typeof value === "number" && actual >= value;
    case "lte":
      return typeof actual === "number" && typeof value === "number" && actual <= value;
    case "between": {
      if (typeof actual !== "number" || !Array.isArray(value) || value.length !== 2) return false;
      return actual >= (value[0] as number) && actual <= (value[1] as number);
    }
    case "in":
      return Array.isArray(value) && value.includes(actual);
    case "not_in":
      return Array.isArray(value) && !value.includes(actual);
    default:
      return false;
  }
}

function allConditionsMatch(conditions: RuleCondition[], expense: Record<string, unknown>): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => matchCondition(c, expense));
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function createApprovalEngine(db: ApprovalEngineDb, tenantId: string) {
  return {
    /**
     * Ensure a default approval rule exists for this tenant.
     * Called lazily on first submit if no rules exist.
     */
    async ensureDefaultRule(): Promise<string> {
      const [existing] = await db
        .select({ id: approvalRules.id })
        .from(approvalRules)
        .where(and(eq(approvalRules.tenantId, tenantId), eq(approvalRules.isDefault, true)))
        .limit(1);
      if (existing) return existing.id;

      const [rule] = await db
        .insert(approvalRules)
        .values({
          tenantId,
          name: "Default approval",
          entityType: "expense",
          isActive: true,
          priority: 0,
          conditions: [],
          isDefault: true,
        })
        .returning({ id: approvalRules.id });

      await db.insert(approvalRuleSteps).values({
        ruleId: rule.id,
        stepOrder: 1,
        approverType: "role",
        approverValue: "finance",
        approvalMode: "any_one",
        canReject: true,
      });

      return rule.id;
    },

    /**
     * Find the first matching approval rule for an expense, ordered by priority desc.
     */
    async resolveRule(expense: Record<string, unknown>): Promise<ApprovalRule | null> {
      const rules = await db
        .select()
        .from(approvalRules)
        .where(
          and(
            eq(approvalRules.tenantId, tenantId),
            eq(approvalRules.isActive, true),
            eq(approvalRules.entityType, "expense")
          )
        )
        .orderBy(desc(approvalRules.priority));

      const expenseData: Record<string, unknown> = {
        amount: expense.amount,
        category_id: expense.categoryId ?? expense.category_id,
        cost_center_id: expense.costCenterId ?? expense.cost_center_id,
        vendor_id: expense.vendorId ?? expense.vendor_id,
        source: expense.source,
      };

      for (const rule of rules) {
        const conditions = (rule.conditions ?? []) as RuleCondition[];
        if (allConditionsMatch(conditions, expenseData)) {
          return rule;
        }
      }
      return null;
    },

    /**
     * Resolve which user IDs are eligible approvers for a given rule step,
     * filtered by user_approval_scopes and the expense context.
     */
    async resolveApproversForStep(
      step: ApprovalRuleStep,
      expense: Record<string, unknown>
    ): Promise<string[]> {
      const LEGACY_APPROVER_ROLES = ["admin", "finance"];

      if (step.approverType === "user" && step.approverValue) {
        return [step.approverValue];
      }

      if (step.approverType === "cost_center_head") {
        const ccId = (expense.costCenterId ?? expense.cost_center_id) as string | null;
        if (!ccId) {
          return this._getUsersByRoleWithScope(LEGACY_APPROVER_ROLES, expense);
        }
        const scopeUsers = await db
          .select({ userId: userApprovalScopes.userId })
          .from(userApprovalScopes)
          .where(
            and(
              eq(userApprovalScopes.tenantId, tenantId),
              eq(userApprovalScopes.isActive, true),
              eq(userApprovalScopes.scopeType, "cost_center"),
              eq(userApprovalScopes.scopeValueId, ccId)
            )
          );
        const ids = scopeUsers.map((r: { userId: string }) => r.userId);
        if (ids.length > 0) return ids;
        return this._getUsersByRoleWithScope(LEGACY_APPROVER_ROLES, expense);
      }

      if (step.approverType === "category_owner") {
        const catId = (expense.categoryId ?? expense.category_id) as string | null;
        if (!catId) {
          return this._getUsersByRoleWithScope(LEGACY_APPROVER_ROLES, expense);
        }
        const scopeUsers = await db
          .select({ userId: userApprovalScopes.userId })
          .from(userApprovalScopes)
          .where(
            and(
              eq(userApprovalScopes.tenantId, tenantId),
              eq(userApprovalScopes.isActive, true),
              eq(userApprovalScopes.scopeType, "category"),
              eq(userApprovalScopes.scopeValueId, catId)
            )
          );
        const ids = scopeUsers.map((r: { userId: string }) => r.userId);
        if (ids.length > 0) return ids;
        return this._getUsersByRoleWithScope(LEGACY_APPROVER_ROLES, expense);
      }

      if (step.approverType === "role" && step.approverValue) {
        const roles = step.approverValue.split(",").map((r) => r.trim());
        return this._getUsersByRoleWithScope(roles, expense);
      }

      return this._getUsersByRoleWithScope(LEGACY_APPROVER_ROLES, expense);
    },

    /** Internal: find users by role(s) in this tenant, then filter by scopes that cover the expense. */
    async _getUsersByRoleWithScope(
      roles: string[],
      expense: Record<string, unknown>
    ): Promise<string[]> {
      const tenantUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.isActive, true),
            inArray(users.role, roles)
          )
        );

      if (tenantUsers.length === 0) return [];

      const userIds = tenantUsers.map((u: { id: string }) => u.id);

      const scopes = await db
        .select()
        .from(userApprovalScopes)
        .where(
          and(
            eq(userApprovalScopes.tenantId, tenantId),
            eq(userApprovalScopes.isActive, true),
            inArray(userApprovalScopes.userId, userIds)
          )
        );

      // If no scopes are configured at all, all matching-role users are eligible (backward compat)
      if (scopes.length === 0) return userIds;

      const usersWithScopes = new Set(scopes.map((s: { userId: string }) => s.userId));
      const amount = (expense.amount ?? expense.amount) as number | undefined;
      const ccId = (expense.costCenterId ?? expense.cost_center_id) as string | null | undefined;
      const catId = (expense.categoryId ?? expense.category_id) as string | null | undefined;

      const eligible: string[] = [];
      for (const uid of userIds) {
        if (!usersWithScopes.has(uid)) {
          // Users without any scopes: still eligible (backward compat for admin/finance)
          eligible.push(uid);
          continue;
        }
        const userScopes = scopes.filter((s: { userId: string }) => s.userId === uid);
        const covers = userScopes.some((s: {
          scopeType: string;
          scopeValueId: string | null;
          maxAmount: number | null;
        }) => {
          if (s.maxAmount != null && amount != null && amount > s.maxAmount) return false;
          if (s.scopeType === "global") return true;
          if (s.scopeType === "cost_center" && s.scopeValueId === ccId) return true;
          if (s.scopeType === "category" && s.scopeValueId === catId) return true;
          return false;
        });
        if (covers) eligible.push(uid);
      }
      return eligible;
    },

    /**
     * Initiate the approval workflow for an expense.
     * Creates expense_approval_steps rows and activates step 1.
     * Returns the assigned approvers for step 1 (for notification).
     */
    async initiateApproval(
      expenseId: string
    ): Promise<{
      ruleId: string;
      firstStepApproverIds: string[];
      totalSteps: number;
    }> {
      const [expense] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
        .limit(1);
      if (!expense) throw new Error("Expense not found");

      let rule = await this.resolveRule(expense);
      if (!rule) {
        await this.ensureDefaultRule();
        rule = await this.resolveRule(expense);
      }
      if (!rule) throw new Error("No approval rule found");

      const steps = await db
        .select()
        .from(approvalRuleSteps)
        .where(eq(approvalRuleSteps.ruleId, rule.id))
        .orderBy(approvalRuleSteps.stepOrder);

      if (steps.length === 0) throw new Error("Approval rule has no steps");

      // Delete any pre-existing approval steps for this expense (re-submit scenario)
      await db
        .delete(expenseApprovalSteps)
        .where(eq(expenseApprovalSteps.expenseId, expenseId));

      let firstStepApproverIds: string[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const approverIds = await this.resolveApproversForStep(step, expense);
        const isFirst = i === 0;

        await db.insert(expenseApprovalSteps).values({
          expenseId,
          ruleId: rule.id,
          stepId: step.id,
          stepOrder: step.stepOrder,
          status: isFirst ? "pending" : "waiting",
          assignedTo: approverIds,
        });

        if (isFirst) firstStepApproverIds = approverIds;
      }

      return {
        ruleId: rule.id,
        firstStepApproverIds,
        totalSteps: steps.length,
      };
    },

    /**
     * Process an approve or reject action on the current pending step.
     */
    async processApprovalAction(
      expenseId: string,
      userId: string,
      action: "approve" | "reject",
      comment?: string | null
    ): Promise<{
      stepCompleted: number;
      totalSteps: number;
      isFullyApproved: boolean;
      isRejected: boolean;
      nextStepApproverIds: string[] | null;
    }> {
      const allSteps = await db
        .select()
        .from(expenseApprovalSteps)
        .where(eq(expenseApprovalSteps.expenseId, expenseId))
        .orderBy(expenseApprovalSteps.stepOrder);

      if (allSteps.length === 0) throw new Error("No approval steps found for this expense");

      const pendingStep = allSteps.find(
        (s: ExpenseApprovalStep) => s.status === "pending"
      );
      if (!pendingStep) throw new Error("No pending approval step");

      const assignedTo = (pendingStep.assignedTo ?? []) as string[];
      if (!assignedTo.includes(userId)) {
        throw new Error("User is not authorized to act on this step");
      }

      const now = new Date();

      if (action === "reject") {
        await db
          .update(expenseApprovalSteps)
          .set({
            status: "rejected",
            actedById: userId,
            actedAt: now,
            comment: comment ?? null,
          })
          .where(eq(expenseApprovalSteps.id, pendingStep.id));

        // Skip all remaining waiting steps
        const waitingIds = allSteps
          .filter((s: ExpenseApprovalStep) => s.status === "waiting")
          .map((s: ExpenseApprovalStep) => s.id);
        if (waitingIds.length > 0) {
          await db
            .update(expenseApprovalSteps)
            .set({ status: "skipped" })
            .where(inArray(expenseApprovalSteps.id, waitingIds));
        }

        // Update expense status
        await db
          .update(expenses)
          .set({
            status: "rejected",
            approvedById: userId,
            approvedAt: now,
            rejectionReason: comment ?? null,
            updatedAt: now,
          })
          .where(eq(expenses.id, expenseId));

        return {
          stepCompleted: pendingStep.stepOrder,
          totalSteps: allSteps.length,
          isFullyApproved: false,
          isRejected: true,
          nextStepApproverIds: null,
        };
      }

      // Approve
      await db
        .update(expenseApprovalSteps)
        .set({
          status: "approved",
          actedById: userId,
          actedAt: now,
          comment: comment ?? null,
        })
        .where(eq(expenseApprovalSteps.id, pendingStep.id));

      // Find next waiting step
      const nextStep = allSteps.find(
        (s: ExpenseApprovalStep) =>
          s.status === "waiting" && s.stepOrder > pendingStep.stepOrder
      );

      if (nextStep) {
        // Re-resolve approvers for the next step (they may have changed)
        const [expense] = await db
          .select()
          .from(expenses)
          .where(eq(expenses.id, expenseId))
          .limit(1);

        const [ruleStep] = await db
          .select()
          .from(approvalRuleSteps)
          .where(eq(approvalRuleSteps.id, nextStep.stepId))
          .limit(1);

        let nextApprovers: string[] = [];
        if (ruleStep && expense) {
          nextApprovers = await this.resolveApproversForStep(ruleStep, expense);
        }

        await db
          .update(expenseApprovalSteps)
          .set({
            status: "pending",
            assignedTo: nextApprovers,
          })
          .where(eq(expenseApprovalSteps.id, nextStep.id));

        return {
          stepCompleted: pendingStep.stepOrder,
          totalSteps: allSteps.length,
          isFullyApproved: false,
          isRejected: false,
          nextStepApproverIds: nextApprovers,
        };
      }

      // Final step approved - mark expense approved
      const [expenseRow] = await db
        .select({
          pettyCashFundId: expenses.pettyCashFundId,
          amount: expenses.amount,
        })
        .from(expenses)
        .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
        .limit(1);

      await db
        .update(expenses)
        .set({
          status: "approved",
          approvedById: userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(expenses.id, expenseId));

      // Handle petty cash fund balance decrement on final approval
      if (expenseRow?.pettyCashFundId) {
        const [fund] = await db
          .select({
            id: pettyCashFunds.id,
            currentBalance: pettyCashFunds.currentBalance,
          })
          .from(pettyCashFunds)
          .where(
            and(
              eq(pettyCashFunds.id, expenseRow.pettyCashFundId),
              eq(pettyCashFunds.tenantId, tenantId)
            )
          )
          .limit(1);
        if (fund) {
          const amt = expenseRow.amount ?? 0;
          const newBal = Math.max(0, fund.currentBalance - amt);
          await db
            .update(pettyCashFunds)
            .set({ currentBalance: newBal, updatedAt: now, updatedById: userId })
            .where(eq(pettyCashFunds.id, fund.id));
        }
      }

      return {
        stepCompleted: pendingStep.stepOrder,
        totalSteps: allSteps.length,
        isFullyApproved: true,
        isRejected: false,
        nextStepApproverIds: null,
      };
    },

    /**
     * Get the full approval status/history for an expense.
     */
    async getApprovalStatus(expenseId: string): Promise<ApprovalStatus | null> {
      const steps = await db
        .select({
          id: expenseApprovalSteps.id,
          stepOrder: expenseApprovalSteps.stepOrder,
          status: expenseApprovalSteps.status,
          ruleId: expenseApprovalSteps.ruleId,
          stepId: expenseApprovalSteps.stepId,
          assignedTo: expenseApprovalSteps.assignedTo,
          actedById: expenseApprovalSteps.actedById,
          actedAt: expenseApprovalSteps.actedAt,
          comment: expenseApprovalSteps.comment,
        })
        .from(expenseApprovalSteps)
        .where(eq(expenseApprovalSteps.expenseId, expenseId))
        .orderBy(expenseApprovalSteps.stepOrder);

      if (steps.length === 0) return null;

      const ruleId = steps[0].ruleId;
      const [rule] = await db
        .select({ name: approvalRules.name })
        .from(approvalRules)
        .where(eq(approvalRules.id, ruleId))
        .limit(1);

      const stepIds = steps.map((s: { stepId: string }) => s.stepId);
      const ruleSteps = await db
        .select()
        .from(approvalRuleSteps)
        .where(inArray(approvalRuleSteps.id, stepIds));
      const ruleStepMap = new Map<string, ApprovalRuleStep>(ruleSteps.map((rs: ApprovalRuleStep) => [rs.id, rs]));

      // Resolve actor names
      const actedByIds = steps
        .map((s: { actedById: string | null }) => s.actedById)
        .filter(Boolean) as string[];
      let actorMap = new Map<string, string>();
      if (actedByIds.length > 0) {
        const actors = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, actedByIds));
        actorMap = new Map(actors.map((a: { id: string; name: string }) => [a.id, a.name]));
      }

      const currentPending = steps.find(
        (s: { status: string }) => s.status === "pending"
      );

      return {
        ruleId,
        ruleName: rule?.name ?? "Unknown rule",
        steps: steps.map((s: {
          id: string;
          stepOrder: number;
          status: string;
          stepId: string;
          assignedTo: unknown;
          actedById: string | null;
          actedAt: Date | null;
          comment: string | null;
        }) => {
          const rs = ruleStepMap.get(s.stepId);
          return {
            id: s.id,
            stepOrder: s.stepOrder,
            status: s.status,
            approverType: rs?.approverType ?? "unknown",
            approverValue: rs?.approverValue ?? null,
            approvalMode: rs?.approvalMode ?? "any_one",
            assignedTo: (s.assignedTo ?? []) as string[],
            actedById: s.actedById,
            actedByName: s.actedById ? actorMap.get(s.actedById) ?? null : null,
            actedAt: s.actedAt,
            comment: s.comment,
          };
        }),
        currentStepOrder: currentPending?.stepOrder ?? null,
        isFullyApproved: steps.every(
          (s: { status: string }) => s.status === "approved" || s.status === "skipped"
        ),
        isRejected: steps.some((s: { status: string }) => s.status === "rejected"),
      };
    },

    /**
     * Get expenses pending the given user's approval.
     */
    async getMyPendingApprovals(userId: string): Promise<
      Array<{
        expenseId: string;
        stepId: string;
        stepOrder: number;
        totalSteps: number;
        amount: number;
        vendorName: string | null;
        description: string | null;
        costCenterName: string | null;
        categoryName: string | null;
        submittedByName: string | null;
        submittedAt: Date | null;
        expenseDate: Date | null;
      }>
    > {
      // Find all pending approval steps where this user is assigned
      const pendingSteps = await db
        .select({
          id: expenseApprovalSteps.id,
          expenseId: expenseApprovalSteps.expenseId,
          stepOrder: expenseApprovalSteps.stepOrder,
          assignedTo: expenseApprovalSteps.assignedTo,
        })
        .from(expenseApprovalSteps)
        .where(
          and(
            eq(expenseApprovalSteps.status, "pending"),
            sql`${expenseApprovalSteps.assignedTo}::jsonb @> ${JSON.stringify([userId])}::jsonb`
          )
        );

      if (pendingSteps.length === 0) return [];

      const expenseIds = pendingSteps.map(
        (s: { expenseId: string }) => s.expenseId
      );

      // Fetch expense details
      const submitterTable = sql`users AS submitter`;
      const expenseRows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          vendorName: expenses.vendorName,
          description: expenses.description,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          submittedByName: sql<string>`submitter.name`,
          submittedAt: expenses.submittedAt,
          expenseDate: expenses.expenseDate,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(sql`users AS submitter`, sql`${expenses.submittedById} = submitter.id`)
        .where(
          and(eq(expenses.tenantId, tenantId), inArray(expenses.id, expenseIds))
        );

      type ExpenseRow = {
        id: string;
        amount: number;
        vendorName: string | null;
        description: string | null;
        costCenterName: string | null;
        categoryName: string | null;
        submittedByName: string | null;
        submittedAt: Date | null;
        expenseDate: Date | null;
      };
      const expenseMap = new Map<string, ExpenseRow>(
        expenseRows.map((r: Record<string, unknown>) => [r.id as string, r as unknown as ExpenseRow])
      );

      // Count total steps per expense
      const totalStepCounts = await db
        .select({
          expenseId: expenseApprovalSteps.expenseId,
          count: sql<number>`count(*)::int`,
        })
        .from(expenseApprovalSteps)
        .where(inArray(expenseApprovalSteps.expenseId, expenseIds))
        .groupBy(expenseApprovalSteps.expenseId);
      const stepCountMap = new Map(
        totalStepCounts.map((r: { expenseId: string; count: number }) => [
          r.expenseId,
          r.count,
        ])
      );

      return pendingSteps
        .map((step: { id: string; expenseId: string; stepOrder: number }) => {
          const exp = expenseMap.get(step.expenseId);
          if (!exp) return null;
          return {
            expenseId: step.expenseId,
            stepId: step.id,
            stepOrder: step.stepOrder,
            totalSteps: stepCountMap.get(step.expenseId) ?? 1,
            amount: exp.amount as number,
            vendorName: (exp.vendorName as string) ?? null,
            description: (exp.description as string) ?? null,
            costCenterName: (exp.costCenterName as string) ?? null,
            categoryName: (exp.categoryName as string) ?? null,
            submittedByName: (exp.submittedByName as string) ?? null,
            submittedAt: (exp.submittedAt as Date) ?? null,
            expenseDate: (exp.expenseDate as Date) ?? null,
          };
        })
        .filter(Boolean);
    },

    /**
     * Check if a user can act on the current pending step of an expense.
     */
    async canUserApprove(expenseId: string, userId: string): Promise<boolean> {
      const [pendingStep] = await db
        .select({ assignedTo: expenseApprovalSteps.assignedTo })
        .from(expenseApprovalSteps)
        .where(
          and(
            eq(expenseApprovalSteps.expenseId, expenseId),
            eq(expenseApprovalSteps.status, "pending")
          )
        )
        .limit(1);
      if (!pendingStep) return false;
      const assigned = (pendingStep.assignedTo ?? []) as string[];
      return assigned.includes(userId);
    },

    /**
     * Check if a user has any approval authority (scopes or legacy role).
     */
    async hasAnyApprovalAuthority(userId: string): Promise<boolean> {
      const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return false;

      if (["admin", "finance", "super_admin"].includes(user.role)) return true;

      const [scope] = await db
        .select({ id: userApprovalScopes.id })
        .from(userApprovalScopes)
        .where(
          and(
            eq(userApprovalScopes.tenantId, tenantId),
            eq(userApprovalScopes.userId, userId),
            eq(userApprovalScopes.isActive, true)
          )
        )
        .limit(1);

      return !!scope;
    },

    // ------- CRUD helpers for rules and scopes (used by API routes) -------

    async listRules(): Promise<Array<ApprovalRule & { steps: ApprovalRuleStep[] }>> {
      const rules = await db
        .select()
        .from(approvalRules)
        .where(
          and(eq(approvalRules.tenantId, tenantId), eq(approvalRules.entityType, "expense"))
        )
        .orderBy(desc(approvalRules.priority));

      if (rules.length === 0) return [];

      const ruleIds = rules.map((r: ApprovalRule) => r.id);
      const steps = await db
        .select()
        .from(approvalRuleSteps)
        .where(inArray(approvalRuleSteps.ruleId, ruleIds))
        .orderBy(approvalRuleSteps.stepOrder);

      return rules.map((r: ApprovalRule) => ({
        ...r,
        steps: steps.filter((s: ApprovalRuleStep) => s.ruleId === r.id),
      }));
    },

    async createRule(data: {
      name: string;
      priority: number;
      conditions: RuleCondition[];
      steps: Array<{
        approverType: string;
        approverValue?: string | null;
        approvalMode?: string;
        canReject?: boolean;
      }>;
    }): Promise<{ id: string }> {
      const [rule] = await db
        .insert(approvalRules)
        .values({
          tenantId,
          name: data.name,
          entityType: "expense",
          priority: data.priority,
          conditions: data.conditions,
          isDefault: false,
        })
        .returning({ id: approvalRules.id });

      for (let i = 0; i < data.steps.length; i++) {
        const s = data.steps[i];
        await db.insert(approvalRuleSteps).values({
          ruleId: rule.id,
          stepOrder: i + 1,
          approverType: s.approverType,
          approverValue: s.approverValue ?? null,
          approvalMode: s.approvalMode ?? "any_one",
          canReject: s.canReject ?? true,
        });
      }

      return { id: rule.id };
    },

    async updateRule(
      ruleId: string,
      data: {
        name?: string;
        priority?: number;
        conditions?: RuleCondition[];
        isActive?: boolean;
        steps?: Array<{
          approverType: string;
          approverValue?: string | null;
          approvalMode?: string;
          canReject?: boolean;
        }>;
      }
    ): Promise<boolean> {
      const [existing] = await db
        .select()
        .from(approvalRules)
        .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.tenantId, tenantId)))
        .limit(1);
      if (!existing) return false;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) updates.name = data.name;
      if (data.priority !== undefined) updates.priority = data.priority;
      if (data.conditions !== undefined) updates.conditions = data.conditions;
      if (data.isActive !== undefined) updates.isActive = data.isActive;

      await db
        .update(approvalRules)
        .set(updates)
        .where(eq(approvalRules.id, ruleId));

      if (data.steps) {
        await db
          .delete(approvalRuleSteps)
          .where(eq(approvalRuleSteps.ruleId, ruleId));

        for (let i = 0; i < data.steps.length; i++) {
          const s = data.steps[i];
          await db.insert(approvalRuleSteps).values({
            ruleId,
            stepOrder: i + 1,
            approverType: s.approverType,
            approverValue: s.approverValue ?? null,
            approvalMode: s.approvalMode ?? "any_one",
            canReject: s.canReject ?? true,
          });
        }
      }

      return true;
    },

    async deleteRule(ruleId: string): Promise<boolean> {
      const [existing] = await db
        .select({ isDefault: approvalRules.isDefault })
        .from(approvalRules)
        .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.tenantId, tenantId)))
        .limit(1);
      if (!existing) return false;
      if (existing.isDefault) return false; // cannot delete default rule

      await db.delete(approvalRules).where(eq(approvalRules.id, ruleId));
      return true;
    },

    async listScopes(): Promise<
      Array<{
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        userRole: string;
        scopeType: string;
        scopeValueId: string | null;
        scopeValueName: string | null;
        maxAmount: number | null;
        isActive: boolean;
      }>
    > {
      const rows = await db
        .select({
          id: userApprovalScopes.id,
          userId: userApprovalScopes.userId,
          userName: users.name,
          userEmail: users.email,
          userRole: users.role,
          scopeType: userApprovalScopes.scopeType,
          scopeValueId: userApprovalScopes.scopeValueId,
          maxAmount: userApprovalScopes.maxAmount,
          isActive: userApprovalScopes.isActive,
        })
        .from(userApprovalScopes)
        .innerJoin(users, eq(userApprovalScopes.userId, users.id))
        .where(eq(userApprovalScopes.tenantId, tenantId))
        .orderBy(users.name);

      // Resolve scope value names
      const ccIds = rows
        .filter((r: { scopeType: string; scopeValueId: string | null }) => r.scopeType === "cost_center" && r.scopeValueId)
        .map((r: { scopeValueId: string | null }) => r.scopeValueId!);
      const catIds = rows
        .filter((r: { scopeType: string; scopeValueId: string | null }) => r.scopeType === "category" && r.scopeValueId)
        .map((r: { scopeValueId: string | null }) => r.scopeValueId!);

      let ccMap = new Map<string, string>();
      let catMap = new Map<string, string>();

      if (ccIds.length > 0) {
        const ccs = await db
          .select({ id: costCenters.id, name: costCenters.name })
          .from(costCenters)
          .where(inArray(costCenters.id, ccIds));
        ccMap = new Map(ccs.map((c: { id: string; name: string }) => [c.id, c.name]));
      }

      if (catIds.length > 0) {
        const cats = await db
          .select({ id: expenseCategories.id, name: expenseCategories.name })
          .from(expenseCategories)
          .where(inArray(expenseCategories.id, catIds));
        catMap = new Map(cats.map((c: { id: string; name: string }) => [c.id, c.name]));
      }

      return rows.map((r: {
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        userRole: string;
        scopeType: string;
        scopeValueId: string | null;
        maxAmount: number | null;
        isActive: boolean;
      }) => ({
        ...r,
        scopeValueName:
          r.scopeType === "cost_center"
            ? ccMap.get(r.scopeValueId!) ?? null
            : r.scopeType === "category"
              ? catMap.get(r.scopeValueId!) ?? null
              : r.scopeType === "global"
                ? "All"
                : null,
      }));
    },

    async createScope(data: {
      userId: string;
      scopeType: string;
      scopeValueId?: string | null;
      maxAmount?: number | null;
    }): Promise<{ id: string }> {
      const [scope] = await db
        .insert(userApprovalScopes)
        .values({
          tenantId,
          userId: data.userId,
          scopeType: data.scopeType,
          scopeValueId: data.scopeValueId ?? null,
          maxAmount: data.maxAmount ?? null,
        })
        .returning({ id: userApprovalScopes.id });
      return { id: scope.id };
    },

    async updateScope(
      scopeId: string,
      data: {
        scopeType?: string;
        scopeValueId?: string | null;
        maxAmount?: number | null;
        isActive?: boolean;
      }
    ): Promise<boolean> {
      const [existing] = await db
        .select()
        .from(userApprovalScopes)
        .where(
          and(eq(userApprovalScopes.id, scopeId), eq(userApprovalScopes.tenantId, tenantId))
        )
        .limit(1);
      if (!existing) return false;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.scopeType !== undefined) updates.scopeType = data.scopeType;
      if (data.scopeValueId !== undefined) updates.scopeValueId = data.scopeValueId;
      if (data.maxAmount !== undefined) updates.maxAmount = data.maxAmount;
      if (data.isActive !== undefined) updates.isActive = data.isActive;

      await db
        .update(userApprovalScopes)
        .set(updates)
        .where(eq(userApprovalScopes.id, scopeId));
      return true;
    },

    async deleteScope(scopeId: string): Promise<boolean> {
      const [existing] = await db
        .select()
        .from(userApprovalScopes)
        .where(
          and(eq(userApprovalScopes.id, scopeId), eq(userApprovalScopes.tenantId, tenantId))
        )
        .limit(1);
      if (!existing) return false;

      await db.delete(userApprovalScopes).where(eq(userApprovalScopes.id, scopeId));
      return true;
    },
  };
}

export type ApprovalEngine = ReturnType<typeof createApprovalEngine>;
