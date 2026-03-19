import express, { type Express } from "express";
import multer from "multer";
import passport from "passport";
import { eq, and, desc, or, sql, inArray, isNull, gte, lte, aliasedTable } from "drizzle-orm";
import { db, pool } from "./db.js";
import { parseBankStatementCsv, isValidDateString } from "../lib/bank-statement-parser.js";
import { analyzeImportSuggestions } from "../lib/import-analyzer.js";
import { hashPassword, requireAdmin, requireSuperAdmin, getTenantId } from "./auth.js";
import { logger } from "./logger.js";
import {
  tenants,
  tenantWabaProviders,
  costCenters,
  users,
  expenses,
  expenseCategories,
  finJoeContacts,
  finJoeConversations,
  finJoeMessages,
  finJoeMedia,
  finJoeRoleChangeRequests,
  finjoeSettings,
  platformSettings,
  incomeCategories,
  incomeRecords,
  incomeTypes,
  cronRuns,
  bankTransactions,
} from "../shared/schema.js";
import { createFinJoeData, generateExpensesFromTemplates, generateIncomeFromTemplates, listDistinctVendorNames } from "../lib/finjoe-data.js";
import { runBackfillEmbeddings } from "../lib/backfill-embeddings.js";
import { runWeeklyInsights } from "../worker/src/weekly-insights.js";
import { logCronRun } from "../lib/cron-logger.js";
import { createTemplatesInTwilio, submitTemplatesForApproval } from "../lib/twilio-content-create.js";
import { fetchApprovedTemplatesFromTwilio, fetchTemplateStatusesFromTwilio } from "../lib/twilio-content-sync.js";
import { sendFinJoeEmail } from "../worker/src/email.js";
import { sendFinJoeSms, sendFinJoeWhatsAppTemplate } from "../worker/src/twilio.js";
import { getCredentialsForTenant } from "../worker/src/providers/resolver.js";
import { getAnalytics, getPredictions } from "./analytics.js";
import { generateAnalyticsInsights } from "../lib/analytics-insights.js";
import { getMISReport, getMISCellTransactions } from "./mis-report.js";
import { seedMISCategoriesForTenant } from "./seed-mis-categories.js";
import { getMedia } from "../lib/media-storage.js";
import {
  notifyFinanceForApproval,
  notifySubmitterForApprovalRejectionFromExpense,
  notifyRoleRequestRequester,
  notifySubmitterForPayoutFromExpense,
} from "../lib/notifications.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const EXPORT_ROW_LIMIT = parseInt(process.env.EXPORT_ROW_LIMIT ?? "10000", 10) || 10000;
const LIST_PAGE_SIZE = 100;
const LIST_PAGE_SIZE_MAX = 200;

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function registerRoutes(app: Express) {
  const http = await import("http");
  const server = http.createServer(app);

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        logger.error("Login error", { requestId: req.requestId, err: String(err) });
        return res.status(500).json({ error: "Authentication error" });
      }
      if (!user) {
        logger.info("Login failed", { requestId: req.requestId, reason: info?.message || "Invalid credentials" });
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          logger.error("Login session error", { requestId: req.requestId, err: String(loginErr) });
          return res.status(500).json({ error: "Login failed" });
        }
        logger.info("Login success", { requestId: req.requestId, userId: user.id, email: user.email });
        const { passwordHash, ...u } = user;
        res.json(u);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.user ? (req.user as { id?: string }).id : undefined;
    req.logout(() => {
      logger.info("Logout", { requestId: req.requestId, userId });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const { passwordHash, ...u } = req.user as any;
    res.json(u);
  });

  app.get("/api/setup/status", async (_req, res) => {
    try {
      const [admin] = await db
        .select()
        .from(users)
        .where(inArray(users.role, ["admin", "super_admin"]))
        .limit(1);
      res.json({ setupComplete: !!admin, needsSetup: !admin });
    } catch {
      res.json({ setupComplete: false, needsSetup: true });
    }
  });

  app.post("/api/setup", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ error: "email and password required" });
      const [existing] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      if (existing) return res.status(400).json({ error: "Admin already exists" });
      const [defaultTenant] = await db.select().from(tenants).where(eq(tenants.slug, "default")).limit(1);
      const tenantId = defaultTenant?.id ?? null;
      const [created] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash: await hashPassword(password),
          name: name || "Admin",
          role: "admin",
          tenantId,
          isActive: true,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create admin" });
      const { passwordHash, ...u } = created;
      logger.info("Setup completed", { requestId: req.requestId, adminId: created.id });
      res.status(201).json(u);
    } catch (e) {
      logger.error("Setup error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Setup failed" });
    }
  });

  app.get("/api/cost-centers", async (req, res) => {
    try {
      const q = req.query?.tenantId;
      const tenantId = getTenantId(req) ?? (typeof q === "string" ? q : null);
      if (!tenantId) return res.status(400).json({ error: "tenantId required (login or pass ?tenantId=)" });
      const rows = await db
        .select()
        .from(costCenters)
        .where(and(eq(costCenters.isActive, true), eq(costCenters.tenantId, tenantId)))
        .orderBy(costCenters.name);
      res.json(rows);
    } catch (e) {
      logger.error("Cost centers error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch cost centers" });
    }
  });

  app.get("/api/campuses", async (req, res) => {
    try {
      const q = req.query?.tenantId;
      const tenantId = getTenantId(req) ?? (typeof q === "string" ? q : null);
      if (!tenantId) return res.status(400).json({ error: "tenantId required (login or pass ?tenantId=)" });
      const rows = await db
        .select()
        .from(costCenters)
        .where(and(eq(costCenters.isActive, true), eq(costCenters.tenantId, tenantId)))
        .orderBy(costCenters.name);
      res.json(rows);
    } catch (e) {
      logger.error("Campuses error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch campuses" });
    }
  });

  app.get("/api/admin/cost-centers", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? req.query?.tenantId;
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(400).json({ error: "tenantId required" });
      if (!tenantId || typeof tenantId !== "string") return res.status(400).json({ error: "tenantId required" });

      const creatorTable = aliasedTable(users, "creator");
      const updaterTable = aliasedTable(users, "updater");

      const rows = await db
        .select({
          id: costCenters.id,
          tenantId: costCenters.tenantId,
          name: costCenters.name,
          slug: costCenters.slug,
          type: costCenters.type,
          isActive: costCenters.isActive,
          createdAt: costCenters.createdAt,
          updatedAt: costCenters.updatedAt,
          createdByName: creatorTable.name,
          updatedByName: updaterTable.name,
        })
        .from(costCenters)
        .leftJoin(creatorTable, eq(costCenters.createdById, creatorTable.id))
        .leftJoin(updaterTable, eq(costCenters.updatedById, updaterTable.id))
        .where(eq(costCenters.tenantId, tenantId))
        .orderBy(costCenters.name);
      res.json(rows);
    } catch (e) {
      logger.error("Admin cost centers error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch cost centers" });
    }
  });

  app.post("/api/admin/cost-centers", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? req.body?.tenantId;
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(400).json({ error: "tenantId required" });
      if (!tenantId || typeof tenantId !== "string") return res.status(400).json({ error: "tenantId required (pass in body for super_admin)" });
      const { name, slug, type } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" });
      const slugVal = (slug && typeof slug === "string" && slug.trim())
        ? slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        : name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!slugVal || /^[-]+$/.test(slugVal)) return res.status(400).json({ error: "slug could not be derived from name (use letters or numbers)" });
      const [created] = await db
        .insert(costCenters)
        .values({
          tenantId,
          name: name.trim(),
          slug: slugVal,
          type: (type && typeof type === "string") ? type.trim() || null : null,
          isActive: true,
          createdById: user?.id || null,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "A cost center with this slug already exists" });
      logger.error("Cost center create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/cost-centers/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? req.body?.tenantId;
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(400).json({ error: "tenantId required" });
      if (!tenantId || typeof tenantId !== "string") return res.status(400).json({ error: "tenantId required" });
      const { name, slug, type, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined && typeof name === "string" && name.trim()) updates.name = name.trim();
      if (slug !== undefined && typeof slug === "string" && slug.trim())
        updates.slug = slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (type !== undefined) updates.type = (typeof type === "string" && type.trim()) ? type.trim() : null;
      if (typeof isActive === "boolean") updates.isActive = isActive;
      updates.updatedById = user?.id || null;
      const whereClause = and(eq(costCenters.id, req.params.id), eq(costCenters.tenantId, tenantId));
      const [updated] = await db.update(costCenters).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "A cost center with this slug already exists" });
      logger.error("Cost center update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/admin/cost-centers/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? req.body?.tenantId ?? req.query?.tenantId;
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(400).json({ error: "tenantId required" });
      if (!tenantId || typeof tenantId !== "string") return res.status(400).json({ error: "tenantId required" });
      const whereClause = and(eq(costCenters.id, req.params.id), eq(costCenters.tenantId, tenantId));
      const [updated] = await db.update(costCenters).set({ isActive: false, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Cost center delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const conditions = [eq(users.isActive, true)];
      if (user.role !== "super_admin" && tenantId) conditions.push(eq(users.tenantId, tenantId));
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(...conditions))
        .orderBy(users.name);
      res.json(rows);
    } catch (e) {
      logger.error("Admin users error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/finjoe/contacts", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const rows = tenantId
        ? await db.select().from(finJoeContacts).where(eq(finJoeContacts.tenantId, tenantId)).orderBy(finJoeContacts.createdAt)
        : await db.select().from(finJoeContacts).orderBy(finJoeContacts.createdAt);
      res.json(rows);
    } catch (e) {
      logger.error("FinJoe contacts error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.post("/api/admin/finjoe/contacts", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? req.body.tenantId;
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(400).json({ error: "tenantId required" });
      if (!tenantId) return res.status(400).json({ error: "tenantId required (pass in body for super_admin)" });

      const { phone, role, name, campusId, costCenterId, studentId } = req.body;
      const ccId = costCenterId ?? campusId;
      if (!phone || !role) return res.status(400).json({ error: "phone and role required" });
      const digits = phone.replace(/\D/g, "");
      const normalized = digits.length === 10 ? `91${digits}` : digits.startsWith("91") ? digits : `91${digits}`;
      const validRoles = ["cost_center_coordinator", "campus_coordinator", "head_office", "finance", "admin", "vendor", "faculty", "student", "guest"];
      if (!validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });

      let resolvedUserId = studentId || null;
      if ((role === "admin" || role === "finance") && !resolvedUserId) {
        const finjoeEmail = `finjoe-${tenantId}-${normalized}@finjoe.internal`;
        const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, finjoeEmail), eq(users.tenantId, tenantId))).limit(1);
        if (existing) resolvedUserId = existing.id;
        else {
          const [newUser] = await db
            .insert(users)
            .values({
              email: finjoeEmail,
              passwordHash: await hashPassword(crypto.randomUUID()),
              name: name || "FinJoe Admin",
              role,
              tenantId,
              costCenterId: ccId || null,
              isActive: true,
            })
            .returning({ id: users.id });
          if (newUser) resolvedUserId = newUser.id;
        }
      }

      const [created] = await db
        .insert(finJoeContacts)
        .values({
          tenantId,
          phone: normalized.length > 10 ? normalized : `91${normalized}`,
          role,
          name: name || null,
          costCenterId: ccId || null,
          studentId: resolvedUserId,
          isActive: true,
        })
        .returning();
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Contact with this phone already exists in this tenant" });
      logger.error("FinJoe contact create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.patch("/api/admin/finjoe/contacts/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });

      const { role, name, campusId, costCenterId, studentId, isActive } = req.body;
      const ccId = costCenterId ?? campusId;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (role !== undefined) updates.role = role;
      if (name !== undefined) updates.name = name;
      if (ccId !== undefined) updates.costCenterId = ccId;
      if (studentId !== undefined) updates.studentId = studentId;
      if (isActive !== undefined) updates.isActive = isActive;

      const whereClause = tenantId ? and(eq(finJoeContacts.id, req.params.id), eq(finJoeContacts.tenantId, tenantId)) : eq(finJoeContacts.id, req.params.id);
      const [existing] = await db.select().from(finJoeContacts).where(whereClause).limit(1);
      const targetRole = role ?? existing?.role;
      const needsUser = (targetRole === "admin" || targetRole === "finance") && studentId === undefined && existing && !existing.studentId;
      if (needsUser && existing) {
        const finjoeEmail = `finjoe-${existing.tenantId}-${existing.phone}@finjoe.internal`;
        const [ex] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, finjoeEmail), eq(users.tenantId, existing.tenantId))).limit(1);
        if (ex) updates.studentId = ex.id;
        else {
          const [nu] = await db
            .insert(users)
            .values({
              email: finjoeEmail,
              passwordHash: await hashPassword(crypto.randomUUID()),
              name: (name ?? existing.name) || "FinJoe Admin",
              role: targetRole,
              tenantId: existing.tenantId,
              costCenterId: ccId ?? existing.costCenterId,
              isActive: true,
            })
            .returning({ id: users.id });
          if (nu) updates.studentId = nu.id;
        }
      }

      const [updated] = await db.update(finJoeContacts).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Contact not found" });
      res.json(updated);
    } catch (e) {
      logger.error("FinJoe contact update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.delete("/api/admin/finjoe/contacts/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const whereClause = tenantId ? and(eq(finJoeContacts.id, req.params.id), eq(finJoeContacts.tenantId, tenantId)) : eq(finJoeContacts.id, req.params.id);
      const [deleted] = await db.delete(finJoeContacts).where(whereClause).returning();
      if (!deleted) return res.status(404).json({ error: "Contact not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("FinJoe contact delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  app.get("/api/admin/finjoe/role-requests", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });

      const { status } = req.query;
      const conditions = status && typeof status === "string" && status !== "all" ? [eq(finJoeRoleChangeRequests.status, status)] : [];
      if (tenantId) conditions.push(eq(finJoeRoleChangeRequests.tenantId, tenantId));
      let query = db
        .select({
          id: finJoeRoleChangeRequests.id,
          contactPhone: finJoeRoleChangeRequests.contactPhone,
          requestedRole: finJoeRoleChangeRequests.requestedRole,
          name: finJoeRoleChangeRequests.name,
          status: finJoeRoleChangeRequests.status,
          costCenterId: finJoeRoleChangeRequests.costCenterId,
          createdAt: finJoeRoleChangeRequests.createdAt,
          costCenterName: costCenters.name,
        })
        .from(finJoeRoleChangeRequests)
        .leftJoin(costCenters, eq(finJoeRoleChangeRequests.costCenterId, costCenters.id))
        .orderBy(desc(finJoeRoleChangeRequests.createdAt))
        .limit(50)
        .$dynamic();
      if (conditions.length > 0) query = query.where(and(...conditions));
      const rows = await query;
      res.json(rows);
    } catch (e) {
      logger.error("FinJoe role requests error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch role requests" });
    }
  });

  app.post("/api/admin/finjoe/role-requests/:id/approve", requireAdmin, async (req, res) => {
    try {
      let tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      if (!tenantId) {
        const [defaultTenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "default")).limit(1);
        tenantId = defaultTenant?.id ?? "default";
      }
      const [reqRow] = await db
        .select({ contactPhone: finJoeRoleChangeRequests.contactPhone, tenantId: finJoeRoleChangeRequests.tenantId })
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, req.params.id))
        .limit(1);
      const finJoeData = createFinJoeData(db, tenantId);
      const result = await finJoeData.approveRoleRequest(req.params.id, user.id, "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
      if (reqRow?.contactPhone && reqRow?.tenantId) {
        try {
          await notifyRoleRequestRequester(reqRow.contactPhone, "approved", req.params.id, reqRow.tenantId, undefined, req.requestId);
        } catch (notifyErr) {
          logger.error("Failed to notify role request requester for approval", { requestId: req.requestId, err: String(notifyErr) });
        }
      }
      res.json({ id: result.id, approved: true });
    } catch (e) {
      logger.error("FinJoe approve error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  app.post("/api/admin/finjoe/role-requests/:id/reject", requireAdmin, async (req, res) => {
    try {
      let tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      if (!tenantId) {
        const [defaultTenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "default")).limit(1);
        tenantId = defaultTenant?.id ?? "default";
      }
      const { reason } = req.body;
      const [reqRow] = await db
        .select({ contactPhone: finJoeRoleChangeRequests.contactPhone, tenantId: finJoeRoleChangeRequests.tenantId })
        .from(finJoeRoleChangeRequests)
        .where(eq(finJoeRoleChangeRequests.id, req.params.id))
        .limit(1);
      const finJoeData = createFinJoeData(db, tenantId);
      const result = await finJoeData.rejectRoleRequest(req.params.id, user.id, reason || "Rejected via admin", "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
      if (reqRow?.contactPhone && reqRow?.tenantId) {
        try {
          await notifyRoleRequestRequester(reqRow.contactPhone, "rejected", req.params.id, reqRow.tenantId, reason || "Rejected via admin", req.requestId);
        } catch (notifyErr) {
          logger.error("Failed to notify role request requester for rejection", { requestId: req.requestId, err: String(notifyErr) });
        }
      }
      res.json({ id: result.id, rejected: true, reason: reason || "Rejected via admin" });
    } catch (e) {
      logger.error("FinJoe reject error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  // Message and media lookup APIs (proof of transactions)
  app.get("/api/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const { id } = req.params;
      const limit = Math.min(parseInt(String(req.query.limit || LIST_PAGE_SIZE), 10) || LIST_PAGE_SIZE, LIST_PAGE_SIZE_MAX);
      const offset = parseInt(String(req.query.offset || 0), 10) || 0;

      const [conv] = await db
        .select()
        .from(finJoeConversations)
        .where(tenantId ? and(eq(finJoeConversations.id, id), eq(finJoeConversations.tenantId, tenantId)) : eq(finJoeConversations.id, id))
        .limit(1);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      const msgs = await db
        .select({
          id: finJoeMessages.id,
          direction: finJoeMessages.direction,
          body: finJoeMessages.body,
          messageSid: finJoeMessages.messageSid,
          createdAt: finJoeMessages.createdAt,
        })
        .from(finJoeMessages)
        .where(eq(finJoeMessages.conversationId, id))
        .orderBy(desc(finJoeMessages.createdAt))
        .limit(limit)
        .offset(offset);

      const mediaRows = await db
        .select({
          id: finJoeMedia.id,
          messageId: finJoeMedia.messageId,
          contentType: finJoeMedia.contentType,
          fileName: finJoeMedia.fileName,
          sizeBytes: finJoeMedia.sizeBytes,
          expenseId: finJoeMedia.expenseId,
          createdAt: finJoeMedia.createdAt,
        })
        .from(finJoeMedia)
        .where(inArray(finJoeMedia.messageId, msgs.map((m) => m.id)));

      const mediaByMessage = mediaRows.reduce((acc, m) => {
        if (!acc[m.messageId]) acc[m.messageId] = [];
        acc[m.messageId].push(m);
        return acc;
      }, {} as Record<string, typeof mediaRows>);

      const messagesWithMedia = msgs.map((m) => ({
        ...m,
        media: mediaByMessage[m.id] ?? [],
      }));

      res.json({ conversation: conv, messages: messagesWithMedia });
    } catch (e) {
      logger.error("Conversation messages error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/admin/media/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const { id } = req.params;

      const [media] = await db
        .select({
          id: finJoeMedia.id,
          contentType: finJoeMedia.contentType,
          storagePath: finJoeMedia.storagePath,
          data: finJoeMedia.data,
        })
        .from(finJoeMedia)
        .innerJoin(finJoeMessages, eq(finJoeMedia.messageId, finJoeMessages.id))
        .innerJoin(finJoeConversations, eq(finJoeMessages.conversationId, finJoeConversations.id))
        .where(
          tenantId
            ? and(eq(finJoeMedia.id, id), eq(finJoeConversations.tenantId, tenantId))
            : eq(finJoeMedia.id, id)
        )
        .limit(1);

      if (!media) return res.status(404).json({ error: "Media not found" });

      let buffer: Buffer | null = null;
      if (media.storagePath) {
        buffer = await getMedia(media.storagePath);
      }
      if (!buffer && media.data) {
        buffer = Buffer.from(media.data);
      }
      if (!buffer) return res.status(404).json({ error: "Media file not found" });

      const contentType = media.contentType || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="media-${id}"`);
      res.send(buffer);
    } catch (e) {
      logger.error("Media download error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to download media" });
    }
  });

  app.get("/api/admin/expenses/:id/media", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const { id } = req.params;

      const [exp] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(tenantId ? and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)) : eq(expenses.id, id))
        .limit(1);
      if (!exp) return res.status(404).json({ error: "Expense not found" });

      const mediaRows = await db
        .select({
          id: finJoeMedia.id,
          messageId: finJoeMedia.messageId,
          contentType: finJoeMedia.contentType,
          fileName: finJoeMedia.fileName,
          sizeBytes: finJoeMedia.sizeBytes,
          createdAt: finJoeMedia.createdAt,
        })
        .from(finJoeMedia)
        .where(eq(finJoeMedia.expenseId, id))
        .orderBy(desc(finJoeMedia.createdAt));

      res.json(mediaRows);
    } catch (e) {
      logger.error("Expense media error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch expense media" });
    }
  });

  app.get("/api/admin/messages/search", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req) ?? (typeof req.query.tenantId === "string" ? req.query.tenantId : null);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      if (!tenantId) return res.status(400).json({ error: "tenantId required (query param for super_admin)" });
      const contactPhone = typeof req.query.contactPhone === "string" ? req.query.contactPhone.trim() : null;
      const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
      const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
      const limit = Math.min(parseInt(String(req.query.limit || LIST_PAGE_SIZE), 10) || LIST_PAGE_SIZE, LIST_PAGE_SIZE_MAX);
      const offset = parseInt(String(req.query.offset || 0), 10) || 0;

      const conditions = [eq(finJoeConversations.tenantId, tenantId)];
      if (contactPhone) conditions.push(eq(finJoeConversations.contactPhone, contactPhone));
      if (startDate && isValidDateString(startDate)) conditions.push(gte(finJoeMessages.createdAt, new Date(startDate)));
      if (endDate && isValidDateString(endDate)) conditions.push(lte(finJoeMessages.createdAt, new Date(endDate + "T23:59:59.999Z")));

      const rows = await db
        .select({
          id: finJoeMessages.id,
          conversationId: finJoeMessages.conversationId,
          direction: finJoeMessages.direction,
          body: finJoeMessages.body,
          messageSid: finJoeMessages.messageSid,
          createdAt: finJoeMessages.createdAt,
          contactPhone: finJoeConversations.contactPhone,
        })
        .from(finJoeMessages)
        .innerJoin(finJoeConversations, eq(finJoeMessages.conversationId, finJoeConversations.id))
        .where(and(...conditions))
        .orderBy(desc(finJoeMessages.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(rows);
    } catch (e) {
      logger.error("Messages search error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // FinJoe settings (template SIDs)
  app.get("/api/admin/finjoe/settings", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const [row] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, tid)).limit(1);
      if (!row) return res.json(null);
      res.json({
        expenseApprovalTemplateSid: row.expenseApprovalTemplateSid,
        expenseApprovedTemplateSid: row.expenseApprovedTemplateSid,
        expenseRejectedTemplateSid: row.expenseRejectedTemplateSid,
        reEngagementTemplateSid: row.reEngagementTemplateSid,
        notificationEmails: row.notificationEmails,
        resendFromEmail: row.resendFromEmail,
        smsFrom: row.smsFrom,
        costCenterLabel: row.costCenterLabel ?? "Cost Center",
        costCenterType: row.costCenterType ?? "campus",
        requireConfirmationBeforePost: row.requireConfirmationBeforePost ?? false,
        requireAuditFieldsAboveAmount: row.requireAuditFieldsAboveAmount ?? null,
        askOptionalFields: row.askOptionalFields ?? false,
      });
    } catch (e) {
      logger.error("FinJoe settings get error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/finjoe/settings", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { expenseApprovalTemplateSid, expenseApprovedTemplateSid, expenseRejectedTemplateSid, reEngagementTemplateSid, notificationEmails, resendFromEmail, smsFrom, costCenterLabel, costCenterType, requireConfirmationBeforePost, requireAuditFieldsAboveAmount, askOptionalFields } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (expenseApprovalTemplateSid !== undefined) updates.expenseApprovalTemplateSid = expenseApprovalTemplateSid || null;
      if (expenseApprovedTemplateSid !== undefined) updates.expenseApprovedTemplateSid = expenseApprovedTemplateSid || null;
      if (expenseRejectedTemplateSid !== undefined) updates.expenseRejectedTemplateSid = expenseRejectedTemplateSid || null;
      if (reEngagementTemplateSid !== undefined) updates.reEngagementTemplateSid = reEngagementTemplateSid || null;
      if (notificationEmails !== undefined) updates.notificationEmails = notificationEmails || null;
      if (resendFromEmail !== undefined) updates.resendFromEmail = resendFromEmail || null;
      if (smsFrom !== undefined) updates.smsFrom = smsFrom || null;
      if (costCenterLabel !== undefined) updates.costCenterLabel = costCenterLabel || null;
      if (costCenterType !== undefined) updates.costCenterType = costCenterType || null;
      if (requireConfirmationBeforePost !== undefined) updates.requireConfirmationBeforePost = !!requireConfirmationBeforePost;
      if (requireAuditFieldsAboveAmount !== undefined) updates.requireAuditFieldsAboveAmount = requireAuditFieldsAboveAmount == null || requireAuditFieldsAboveAmount === "" ? null : Math.max(0, parseInt(String(requireAuditFieldsAboveAmount), 10));
      if (askOptionalFields !== undefined) updates.askOptionalFields = !!askOptionalFields;
      const [existing] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, tid)).limit(1);
      let result;
      if (existing) {
        [result] = await db.update(finjoeSettings).set(updates as any).where(eq(finjoeSettings.tenantId, tid)).returning();
      } else {
        [result] = await db.insert(finjoeSettings).values({ tenantId: tid, ...updates } as any).returning();
      }
      res.json(result);
    } catch (e) {
      logger.error("FinJoe settings update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/admin/finjoe/create-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const credentials = await getCredentialsForTenant(tid);
      if (!credentials?.config?.accountSid || !credentials.config.authToken) {
        return res.status(400).json({ error: "Twilio credentials not configured for this tenant. Configure WhatsApp provider first." });
      }
      const { created, errors } = await createTemplatesInTwilio(
        credentials.config.accountSid,
        credentials.config.authToken
      );
      if (errors.length > 0 && Object.keys(created).length === 0) {
        return res.status(500).json({ error: "Failed to create templates", details: errors });
      }
      res.json({ created, errors });
    } catch (e) {
      logger.error("FinJoe create-templates error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create templates in Twilio" });
    }
  });

  app.post("/api/admin/finjoe/submit-for-approval", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const credentials = await getCredentialsForTenant(tid);
      if (!credentials?.config?.accountSid || !credentials.config.authToken) {
        return res.status(400).json({ error: "Twilio credentials not configured for this tenant. Configure WhatsApp provider first." });
      }
      const sids = req.body?.sids ?? {};
      if (typeof sids !== "object") return res.status(400).json({ error: "sids must be an object" });
      const { submitted, alreadySubmitted, errors } = await submitTemplatesForApproval(
        credentials.config.accountSid,
        credentials.config.authToken,
        sids
      );
      if (submitted.length === 0 && alreadySubmitted.length === 0 && errors.length > 0) {
        return res.status(500).json({ error: "Failed to submit templates for approval", details: errors });
      }
      res.json({ submitted, alreadySubmitted, errors });
    } catch (e) {
      logger.error("FinJoe submit-for-approval error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to submit templates for approval" });
    }
  });

  app.post("/api/admin/finjoe/sync-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const credentials = await getCredentialsForTenant(tid);
      if (!credentials?.config?.accountSid || !credentials.config.authToken) {
        return res.status(400).json({ error: "Twilio credentials not configured for this tenant. Configure WhatsApp provider first." });
      }
      const { synced, skipped, templateStatuses } = await fetchApprovedTemplatesFromTwilio(
        credentials.config.accountSid,
        credentials.config.authToken
      );
      const [existing] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, tid)).limit(1);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (synced.expenseApprovalTemplateSid !== undefined) updates.expenseApprovalTemplateSid = synced.expenseApprovalTemplateSid;
      if (synced.expenseApprovedTemplateSid !== undefined) updates.expenseApprovedTemplateSid = synced.expenseApprovedTemplateSid;
      if (synced.expenseRejectedTemplateSid !== undefined) updates.expenseRejectedTemplateSid = synced.expenseRejectedTemplateSid;
      if (synced.reEngagementTemplateSid !== undefined) updates.reEngagementTemplateSid = synced.reEngagementTemplateSid;
      if (existing) {
        await db.update(finjoeSettings).set(updates as any).where(eq(finjoeSettings.tenantId, tid));
      } else {
        await db.insert(finjoeSettings).values({ tenantId: tid, ...updates } as any);
      }
      res.json({ synced, skipped, templateStatuses });
    } catch (e) {
      logger.error("FinJoe sync-templates error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to sync templates from Twilio" });
    }
  });

  app.get("/api/admin/finjoe/template-statuses", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string | undefined);
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const credentials = await getCredentialsForTenant(tid);
      if (!credentials?.config?.accountSid || !credentials.config.authToken) {
        return res.status(400).json({ error: "Twilio credentials not configured for this tenant. Configure WhatsApp provider first." });
      }
      const templateStatuses = await fetchTemplateStatusesFromTwilio(
        credentials.config.accountSid,
        credentials.config.authToken
      );
      res.json({ templateStatuses });
    } catch (e) {
      logger.error("FinJoe template-statuses error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch template statuses from Twilio" });
    }
  });

  app.post("/api/admin/finjoe/test-email", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      let to = typeof req.body?.to === "string" ? req.body.to.trim() : null;
      if (!to || !to.includes("@")) {
        const [row] = await db.select({ notificationEmails: finjoeSettings.notificationEmails }).from(finjoeSettings).where(eq(finjoeSettings.tenantId, tid)).limit(1);
        const tenantEmails = (row?.notificationEmails ?? "").split(",").map((e) => e.trim()).filter((e) => e && e.includes("@"));
        if (tenantEmails.length > 0) to = tenantEmails[0];
        else {
          const [platformRow] = await db.select({ defaultNotificationEmails: platformSettings.defaultNotificationEmails }).from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
          const platformEmails = (platformRow?.defaultNotificationEmails ?? "").split(",").map((e) => e.trim()).filter((e) => e && e.includes("@"));
          to = platformEmails[0] ?? null;
        }
      }
      if (!to || !to.includes("@")) return res.status(400).json({ error: "Provide an email address or configure notification emails first" });
      const sent = await sendFinJoeEmail([to], "FinJoe test email", "<p>This is a test email from FinJoe. Your email configuration is working.</p>", { tenantId: tid }, `test-email-${Date.now()}`);
      if (sent) res.json({ ok: true, message: "Test email sent" });
      else res.status(500).json({ error: "Failed to send test email. Check RESEND_API_KEY and domain verification." });
    } catch (e) {
      logger.error("Test email error", { requestId: req.requestId, err: (e as Error).message });
      res.status(500).json({ error: (e as Error).message || "Failed to send test email" });
    }
  });

  app.post("/api/admin/finjoe/test-sms", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const to = typeof req.body?.to === "string" ? req.body.to.trim() : null;
      if (!to || to.length < 10) return res.status(400).json({ error: "Valid phone number required (e.g. +919876543210)" });
      const result = await sendFinJoeSms(to, "FinJoe test SMS. Your SMS configuration is working.", `test-sms-${Date.now()}`, tid);
      if (result) res.json({ ok: true, message: "Test SMS sent" });
      else res.status(500).json({ error: "Failed to send test SMS. Check Twilio credentials and SMS from number." });
    } catch (e) {
      logger.error("Test SMS error", { requestId: req.requestId, err: (e as Error).message });
      res.status(500).json({ error: (e as Error).message || "Failed to send test SMS" });
    }
  });

  app.post("/api/admin/finjoe/test-whatsapp", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const to = typeof req.body?.to === "string" ? req.body.to.trim() : null;
      if (!to || to.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Valid phone number required (e.g. +919876543210)" });
      const templateKey = typeof req.body?.template === "string" ? req.body.template : "re_engagement";
      const templateToField: Record<string, string> = {
        re_engagement: "reEngagementTemplateSid",
        expense_approval: "expenseApprovalTemplateSid",
        expense_approved: "expenseApprovedTemplateSid",
        expense_rejected: "expenseRejectedTemplateSid",
      };
      const field = templateToField[templateKey] ?? templateToField.re_engagement;
      const sidsOverride = req.body?.sids && typeof req.body.sids === "object" ? req.body.sids : null;
      let templateSid: string | null = sidsOverride?.[field] ?? null;
      if (!templateSid) {
        const [row] = await db.select().from(finjoeSettings).where(eq(finjoeSettings.tenantId, tid)).limit(1);
        templateSid = row ? (row as unknown as Record<string, string | null>)[field] : null;
      }
      if (!templateSid?.trim()) return res.status(400).json({ error: `No template SID configured for ${templateKey}. Create, submit, and sync templates first.` });
      const sid = String(templateSid).trim();
      const contentVars: Record<string, string> =
        templateKey === "expense_approval"
          ? { "1": "EXP001", "2": "₹50,000 - Vendor Name" }
          : templateKey === "expense_approved"
            ? { "1": "EXP001" }
            : templateKey === "expense_rejected"
              ? { "1": "EXP001", "2": "Sample reason" }
              : {};
      const result = await sendFinJoeWhatsAppTemplate(to, sid, contentVars, `test-whatsapp-${Date.now()}`, tid);
      if (result) res.json({ ok: true, message: "Test WhatsApp template sent" });
      else res.status(500).json({ error: "Failed to send test WhatsApp. Check Twilio credentials and template approval status." });
    } catch (e) {
      logger.error("Test WhatsApp error", { requestId: req.requestId, err: (e as Error).message });
      res.status(500).json({ error: (e as Error).message || "Failed to send test WhatsApp" });
    }
  });

  // WhatsApp provider credentials (Twilio)
  app.get("/api/admin/finjoe/whatsapp-provider", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const [row] = await db
        .select()
        .from(tenantWabaProviders)
        .where(and(eq(tenantWabaProviders.tenantId, tid), eq(tenantWabaProviders.provider, "twilio"), eq(tenantWabaProviders.isActive, true)))
        .limit(1);
      if (!row) return res.json(null);
      const config = row.config as { accountSid?: string; authToken?: string };
      res.json({
        id: row.id,
        whatsappFrom: row.whatsappFrom,
        accountSid: config?.accountSid ?? "",
        authTokenMasked: config?.authToken ? "••••••••" : "",
        hasAuthToken: !!config?.authToken,
      });
    } catch (e) {
      logger.error("WhatsApp provider get error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch provider" });
    }
  });

  app.put("/api/admin/finjoe/whatsapp-provider", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { accountSid, authToken, whatsappFrom } = req.body;
      if (!accountSid || !whatsappFrom) return res.status(400).json({ error: "accountSid and whatsappFrom required" });
      const fromNorm = whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`;
      const [existing] = await db
        .select()
        .from(tenantWabaProviders)
        .where(and(eq(tenantWabaProviders.tenantId, tid), eq(tenantWabaProviders.provider, "twilio")))
        .limit(1);
      const existingConfig = existing?.config as { accountSid?: string; authToken?: string } | undefined;
      const config = {
        accountSid,
        authToken: (typeof authToken === "string" && authToken.trim()) ? authToken : (existingConfig?.authToken ?? ""),
      };
      let result;
      if (existing) {
        [result] = await db
          .update(tenantWabaProviders)
          .set({ config, whatsappFrom: fromNorm, updatedAt: new Date() })
          .where(eq(tenantWabaProviders.id, existing.id))
          .returning();
      } else {
        if (!config.authToken) return res.status(400).json({ error: "authToken required for new provider" });
        [result] = await db
          .insert(tenantWabaProviders)
          .values({ tenantId: tid, provider: "twilio", config, whatsappFrom: fromNorm, isActive: true })
          .returning();
      }
      res.json({ id: result!.id, whatsappFrom: result!.whatsappFrom });
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Provider already exists for this tenant" });
      logger.error("WhatsApp provider put error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to save provider" });
    }
  });

  // Income categories
  app.get("/api/admin/income-categories", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const includeInactive = req.query?.includeInactive === "true";
      const conditions = [eq(incomeCategories.tenantId, tid)];
      if (!includeInactive) conditions.push(eq(incomeCategories.isActive, true));
      const rows = await db
        .select()
        .from(incomeCategories)
        .where(and(...conditions))
        .orderBy(incomeCategories.displayOrder, incomeCategories.name);
      res.json(rows);
    } catch (e) {
      logger.error("Income categories error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch income categories" });
    }
  });

  app.post("/api/admin/income-categories", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { name, slug, incomeType, displayOrder } = req.body;
      if (!name || !slug) return res.status(400).json({ error: "name and slug required" });
      const slugNorm = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const [created] = await db
        .insert(incomeCategories)
        .values({
          tenantId: tid,
          name,
          slug: slugNorm || slug,
          incomeType: incomeType ?? "other",
          displayOrder: displayOrder ?? 0,
          isActive: true,
          createdById: user?.id || null,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Category slug already exists" });
      logger.error("Income category create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/income-categories/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      const { name, slug, incomeType, displayOrder, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || slug;
      if (incomeType !== undefined) updates.incomeType = incomeType;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (isActive !== undefined) updates.isActive = isActive;
      updates.updatedById = user?.id || null;
      const whereClause = tid ? and(eq(incomeCategories.id, req.params.id), eq(incomeCategories.tenantId, tid)) : eq(incomeCategories.id, req.params.id);
      const [updated] = await db.update(incomeCategories).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      logger.error("Income category update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/admin/income-categories/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rawTid = tenantId ?? req.query?.tenantId;
      const tid = typeof rawTid === "string" ? rawTid : undefined;
      const whereClause = tid ? and(eq(incomeCategories.id, req.params.id), eq(incomeCategories.tenantId, tid)) : eq(incomeCategories.id, req.params.id);
      const [existing] = await db.select({ id: incomeRecords.id }).from(incomeRecords).where(eq(incomeRecords.categoryId, req.params.id)).limit(1);
      if (existing) return res.status(400).json({ error: "Category has income records and cannot be deleted" });
      const [deleted] = await db.delete(incomeCategories).where(whereClause).returning();
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Income category delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // Income types (tenant-configurable)
  app.get("/api/admin/income-types", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const rows = await db
        .select()
        .from(incomeTypes)
        .where(eq(incomeTypes.tenantId, tid))
        .orderBy(incomeTypes.displayOrder, incomeTypes.label);
      res.json(rows);
    } catch (e) {
      logger.error("Income types error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch income types" });
    }
  });

  app.post("/api/admin/income-types", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { slug, label, displayOrder } = req.body;
      if (!slug || !label) return res.status(400).json({ error: "slug and label required" });
      const slugNorm = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const [created] = await db
        .insert(incomeTypes)
        .values({
          tenantId: tid,
          slug: slugNorm || slug,
          label: String(label).trim(),
          displayOrder: displayOrder ?? 0,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Income type slug already exists" });
      logger.error("Income type create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/income-types/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tid = tenantId ?? req.body?.tenantId;
      const { slug, label, displayOrder } = req.body;
      const updates: Record<string, unknown> = {};
      if (slug !== undefined) updates.slug = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || slug;
      if (label !== undefined) updates.label = String(label).trim();
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No updates provided" });
      const whereClause = tid ? and(eq(incomeTypes.id, req.params.id), eq(incomeTypes.tenantId, tid)) : eq(incomeTypes.id, req.params.id);
      const [updated] = await db.update(incomeTypes).set({ ...updates } as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Income type slug already exists" });
      logger.error("Income type update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/admin/income-types/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rawTid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      const tid = typeof rawTid === "string" ? rawTid : undefined;
      const whereClause = tid ? and(eq(incomeTypes.id, req.params.id), eq(incomeTypes.tenantId, tid)) : eq(incomeTypes.id, req.params.id);
      const [deleted] = await db.delete(incomeTypes).where(whereClause).returning();
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Income type delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.post("/api/admin/income-types/seed", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const defaults = [
        { slug: "registration_fee", label: "Registration Fee", displayOrder: 0 },
        { slug: "remaining_fee", label: "Remaining Fee", displayOrder: 1 },
        { slug: "hostel_fee", label: "Hostel Fee", displayOrder: 2 },
        { slug: "other", label: "Other", displayOrder: 3 },
      ];
      let seeded = 0;
      for (const d of defaults) {
        try {
          await db.insert(incomeTypes).values({ tenantId: tid, slug: d.slug, label: d.label, displayOrder: d.displayOrder });
          seeded++;
        } catch (e: any) {
          if (e?.code !== "23505") throw e;
        }
      }
      res.json({ seeded, total: defaults.length });
    } catch (e) {
      logger.error("Income types seed error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to seed income types" });
    }
  });

  // Income records
  app.get("/api/admin/income", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { campusId, costCenterId, categoryId, startDate, endDate, limit: limitParam, offset: offsetParam } = req.query;
      const ccId = (costCenterId ?? campusId) as string | undefined;
      const conditions = [eq(incomeRecords.tenantId, tid)];
      if (ccId && ccId !== "all") {
        if (ccId === "null" || ccId === "corporate" || ccId === "__corporate__") conditions.push(sql`${incomeRecords.costCenterId} IS NULL`);
        else conditions.push(eq(incomeRecords.costCenterId, ccId));
      }
      if (categoryId && categoryId !== "all") conditions.push(eq(incomeRecords.categoryId, categoryId as string));
      if (startDate && typeof startDate === "string") conditions.push(sql`${incomeRecords.incomeDate} >= ${startDate}::date`);
      if (endDate && typeof endDate === "string") conditions.push(sql`${incomeRecords.incomeDate} <= ${endDate}::date`);

      const whereClause = and(...conditions);
      const limit = Math.min(Math.max(1, parseInt(String(limitParam ?? LIST_PAGE_SIZE), 10) || LIST_PAGE_SIZE), LIST_PAGE_SIZE_MAX);
      const offset = Math.max(0, parseInt(String(offsetParam ?? 0), 10) || 0);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(incomeRecords)
        .where(whereClause);

      const recorderTable = aliasedTable(users, "recorder");

      const rows = await db
        .select({
          id: incomeRecords.id,
          tenantId: incomeRecords.tenantId,
          costCenterId: incomeRecords.costCenterId,
          categoryId: incomeRecords.categoryId,
          amount: incomeRecords.amount,
          incomeDate: incomeRecords.incomeDate,
          particulars: incomeRecords.particulars,
          incomeType: incomeRecords.incomeType,
          source: incomeRecords.source,
          createdAt: incomeRecords.createdAt,
          costCenterName: costCenters.name,
          categoryName: incomeCategories.name,
          recordedByName: recorderTable.name,
        })
        .from(incomeRecords)
        .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
        .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
        .leftJoin(recorderTable, eq(incomeRecords.recordedById, recorderTable.id))
        .where(whereClause)
        .orderBy(desc(incomeRecords.incomeDate), desc(incomeRecords.createdAt))
        .limit(limit)
        .offset(offset);

      const total = countRow?.count ?? 0;
      const result = rows.map((r) => ({
        ...r,
        campusId: r.costCenterId,
        campusName: r.costCenterName,
      }));
      res.json({ rows: result, total, limit, offset, hasMore: offset + rows.length < total });
    } catch (e) {
      logger.error("Income list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch income" });
    }
  });

  app.post("/api/admin/income", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { campusId, costCenterId, categoryId, amount, incomeDate, particulars, incomeType } = req.body;
      const ccId = (costCenterId ?? campusId) && (costCenterId ?? campusId) !== "__corporate__" ? (costCenterId ?? campusId) : null;
      if (!categoryId || !amount || amount <= 0 || !incomeDate) return res.status(400).json({ error: "categoryId, amount (>0), and incomeDate required" });
      const [created] = await db
        .insert(incomeRecords)
        .values({
          tenantId: tid,
          costCenterId: ccId,
          categoryId,
          amount: Math.round(Number(amount)),
          incomeDate: new Date(incomeDate),
          particulars: particulars || null,
          incomeType: incomeType ?? "other",
          source: "manual",
          recordedById: user?.id || null,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e) {
      logger.error("Income create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/income/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = (tenantId ?? req.body?.tenantId) as string;
      const { costCenterId, campusId, categoryId, amount, incomeDate, particulars, incomeType } = req.body;
      const ccId = (costCenterId ?? campusId) !== undefined ? ((costCenterId ?? campusId) && (costCenterId ?? campusId) !== "__corporate__" ? (costCenterId ?? campusId) : null) : undefined;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (ccId !== undefined) updates.costCenterId = ccId;
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (amount !== undefined) updates.amount = Math.round(Number(amount));
      if (incomeDate !== undefined) updates.incomeDate = new Date(incomeDate);
      if (particulars !== undefined) updates.particulars = particulars;
      if (incomeType !== undefined) updates.incomeType = incomeType;
      const whereClause = and(eq(incomeRecords.id, req.params.id), eq(incomeRecords.tenantId, tid));
      const [updated] = await db.update(incomeRecords).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      logger.error("Income update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  // --- Reconciliation endpoints ---

  function reconTenantId(req: express.Request, res: express.Response): string | null {
    const tenantId = getTenantId(req);
    const user = req.user as Express.User;
    if (user.role !== "super_admin" && !tenantId) { res.status(403).json({ error: "Tenant context required" }); return null; }
    const tid = (tenantId ?? req.query?.tenantId) as string | undefined;
    if (!tid) { res.status(400).json({ error: "tenantId required" }); return null; }
    return tid;
  }

  function reconDateRange(req: express.Request, res: express.Response): { startDate: string; endDate: string } | null {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
      res.status(400).json({ error: "startDate and endDate required" }); return null;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate) || startDate > endDate) {
      res.status(400).json({ error: "Invalid date range" }); return null;
    }
    return { startDate, endDate };
  }

  app.get("/api/admin/reconciliation/summary", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;

      const bankTxnRows = await db.select({
        type: bankTransactions.type,
        amount: bankTransactions.amount,
        status: bankTransactions.reconciliationStatus,
      }).from(bankTransactions).where(and(
        eq(bankTransactions.tenantId, tid),
        sql`${bankTransactions.transactionDate} >= ${startDate}::date`,
        sql`${bankTransactions.transactionDate} <= ${endDate}::date`,
      ));

      const unmatchedExpCount = await db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(and(
        eq(expenses.tenantId, tid),
        sql`${expenses.expenseDate} >= ${startDate}::date`,
        sql`${expenses.expenseDate} <= ${endDate}::date`,
        isNull(expenses.bankTransactionId),
      ));

      const unmatchedIncCount = await db.select({ count: sql<number>`count(*)::int` }).from(incomeRecords).where(and(
        eq(incomeRecords.tenantId, tid),
        sql`${incomeRecords.incomeDate} >= ${startDate}::date`,
        sql`${incomeRecords.incomeDate} <= ${endDate}::date`,
        isNull(incomeRecords.bankTransactionId),
      ));

      let totalBankDebits = 0, totalBankCredits = 0, matchedCount = 0, unmatchedBankCount = 0;
      for (const row of bankTxnRows) {
        if (row.type === "debit") totalBankDebits += row.amount;
        else totalBankCredits += row.amount;
        if (row.status === "unmatched") unmatchedBankCount++;
        else matchedCount++;
      }

      res.json({
        totalBankTransactions: bankTxnRows.length,
        totalBankDebits,
        totalBankCredits,
        matchedCount,
        unmatchedBankCount,
        unmatchedExpenseCount: unmatchedExpCount[0]?.count ?? 0,
        unmatchedIncomeCount: unmatchedIncCount[0]?.count ?? 0,
        netPosition: totalBankCredits - totalBankDebits,
      });
    } catch (e) {
      logger.error("Reconciliation summary error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch reconciliation summary" });
    }
  });

  app.get("/api/admin/reconciliation/bank-transactions", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? 100), 10) || 100), 500);
      const offset = Math.max(0, parseInt(String(req.query.offset ?? 0), 10) || 0);

      const conditions = [
        eq(bankTransactions.tenantId, tid),
        sql`${bankTransactions.transactionDate} >= ${startDate}::date`,
        sql`${bankTransactions.transactionDate} <= ${endDate}::date`,
      ];
      if (statusFilter && statusFilter !== "all") {
        conditions.push(eq(bankTransactions.reconciliationStatus, statusFilter));
      }

      const whereClause = and(...conditions);

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(bankTransactions).where(whereClause);

      const matcherTable = aliasedTable(users, "matcher");

      const rows = await db.select({
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
        importBatchId: bankTransactions.importBatchId,
        createdAt: bankTransactions.createdAt,
        matchedByName: matcherTable.name,
      }).from(bankTransactions)
        .leftJoin(matcherTable, eq(bankTransactions.matchedById, matcherTable.id))
        .where(whereClause)
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(limit)
        .offset(offset);

      res.json({ rows, total: countRow?.count ?? 0, limit, offset });
    } catch (e) {
      logger.error("Reconciliation bank-transactions error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch bank transactions" });
    }
  });

  app.get("/api/admin/reconciliation/unmatched-expenses", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;
      const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? 100), 10) || 100), 500);
      const offset = Math.max(0, parseInt(String(req.query.offset ?? 0), 10) || 0);

      const conditions = [
        eq(expenses.tenantId, tid),
        sql`${expenses.expenseDate} >= ${startDate}::date`,
        sql`${expenses.expenseDate} <= ${endDate}::date`,
        isNull(expenses.bankTransactionId),
      ];

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(and(...conditions));

      const rows = await db.select({
        id: expenses.id,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        description: expenses.description,
        vendorName: expenses.vendorName,
        status: expenses.status,
        source: expenses.source,
        categoryName: expenseCategories.name,
        costCenterName: costCenters.name,
      }).from(expenses)
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .where(and(...conditions))
        .orderBy(desc(expenses.expenseDate))
        .limit(limit)
        .offset(offset);

      res.json({ rows, total: countRow?.count ?? 0, limit, offset });
    } catch (e) {
      logger.error("Reconciliation unmatched-expenses error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch unmatched expenses" });
    }
  });

  app.get("/api/admin/reconciliation/unmatched-income", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;
      const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? 100), 10) || 100), 500);
      const offset = Math.max(0, parseInt(String(req.query.offset ?? 0), 10) || 0);

      const conditions = [
        eq(incomeRecords.tenantId, tid),
        sql`${incomeRecords.incomeDate} >= ${startDate}::date`,
        sql`${incomeRecords.incomeDate} <= ${endDate}::date`,
        isNull(incomeRecords.bankTransactionId),
      ];

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(incomeRecords).where(and(...conditions));

      const rows = await db.select({
        id: incomeRecords.id,
        amount: incomeRecords.amount,
        incomeDate: incomeRecords.incomeDate,
        particulars: incomeRecords.particulars,
        source: incomeRecords.source,
        categoryName: incomeCategories.name,
      }).from(incomeRecords)
        .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
        .where(and(...conditions))
        .orderBy(desc(incomeRecords.incomeDate))
        .limit(limit)
        .offset(offset);

      res.json({ rows, total: countRow?.count ?? 0, limit, offset });
    } catch (e) {
      logger.error("Reconciliation unmatched-income error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch unmatched income" });
    }
  });

  app.post("/api/admin/reconciliation/auto-match", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;

      const unmatchedBankTxns = await db.select({
        id: bankTransactions.id,
        transactionDate: bankTransactions.transactionDate,
        particulars: bankTransactions.particulars,
        amount: bankTransactions.amount,
        type: bankTransactions.type,
      }).from(bankTransactions).where(and(
        eq(bankTransactions.tenantId, tid),
        eq(bankTransactions.reconciliationStatus, "unmatched"),
        sql`${bankTransactions.transactionDate} >= ${startDate}::date`,
        sql`${bankTransactions.transactionDate} <= ${endDate}::date`,
      ));

      if (unmatchedBankTxns.length === 0) {
        return res.json({ matched: 0 });
      }

      const unmatchedExp = await db.select({
        id: expenses.id, amount: expenses.amount, expenseDate: expenses.expenseDate,
        description: expenses.description, vendorName: expenses.vendorName,
      }).from(expenses).where(and(
        eq(expenses.tenantId, tid), isNull(expenses.bankTransactionId),
        sql`${expenses.expenseDate} >= ${shiftDate(startDate, -5)}::date`,
        sql`${expenses.expenseDate} <= ${shiftDate(endDate, 5)}::date`,
      ));

      const unmatchedInc = await db.select({
        id: incomeRecords.id, amount: incomeRecords.amount, incomeDate: incomeRecords.incomeDate,
        particulars: incomeRecords.particulars,
      }).from(incomeRecords).where(and(
        eq(incomeRecords.tenantId, tid), isNull(incomeRecords.bankTransactionId),
        sql`${incomeRecords.incomeDate} >= ${shiftDate(startDate, -5)}::date`,
        sql`${incomeRecords.incomeDate} <= ${shiftDate(endDate, 5)}::date`,
      ));

      const expByAmountDate = new Map<string, typeof unmatchedExp>();
      for (const e of unmatchedExp) {
        const dateStr = e.expenseDate.toISOString().slice(0, 10);
        for (let d = -5; d <= 5; d++) {
          const key = `${shiftDate(dateStr, d)}|${e.amount}`;
          const arr = expByAmountDate.get(key) ?? [];
          arr.push(e);
          expByAmountDate.set(key, arr);
        }
      }

      const incByAmountDate = new Map<string, typeof unmatchedInc>();
      for (const i of unmatchedInc) {
        const dateStr = i.incomeDate.toISOString().slice(0, 10);
        for (let d = -5; d <= 5; d++) {
          const key = `${shiftDate(dateStr, d)}|${i.amount}`;
          const arr = incByAmountDate.get(key) ?? [];
          arr.push(i);
          incByAmountDate.set(key, arr);
        }
      }

      const matchedExpIds = new Set<string>();
      const matchedIncIds = new Set<string>();
      const matchOps: Array<{ bankTxnId: string; expenseId?: string; incomeId?: string; confidence: string }> = [];

      for (const bt of unmatchedBankTxns) {
        const btDate = bt.transactionDate.toISOString().slice(0, 10);
        const lookupKey = `${btDate}|${bt.amount}`;

        if (bt.type === "debit") {
          const candidates = expByAmountDate.get(lookupKey)?.filter((e) => !matchedExpIds.has(e.id)) ?? [];
          if (candidates.length > 0) {
            const exact = candidates.find((e) => {
              const eDateStr = e.expenseDate.toISOString().slice(0, 10);
              return eDateStr === btDate && textsOverlap(bt.particulars ?? undefined, e.description, e.vendorName);
            });
            const close = !exact ? candidates.find((e) => {
              const eDateStr = e.expenseDate.toISOString().slice(0, 10);
              const dayDiff = Math.abs(new Date(btDate).getTime() - new Date(eDateStr).getTime()) / 86400000;
              return dayDiff <= 2 && textsOverlap(bt.particulars ?? undefined, e.description, e.vendorName);
            }) : undefined;
            const amountOnly = !exact && !close ? candidates.find((e) => {
              const eDateStr = e.expenseDate.toISOString().slice(0, 10);
              const dayDiff = Math.abs(new Date(btDate).getTime() - new Date(eDateStr).getTime()) / 86400000;
              return dayDiff <= 5;
            }) : undefined;

            const match = exact ?? close ?? amountOnly;
            if (match) {
              const confidence = exact ? "exact" : close ? "close" : "amount_only";
              matchOps.push({ bankTxnId: bt.id, expenseId: match.id, confidence });
              matchedExpIds.add(match.id);
            }
          }
        } else {
          const candidates = incByAmountDate.get(lookupKey)?.filter((i) => !matchedIncIds.has(i.id)) ?? [];
          if (candidates.length > 0) {
            const exact = candidates.find((i) => {
              const iDateStr = i.incomeDate.toISOString().slice(0, 10);
              return iDateStr === btDate && textsOverlap(bt.particulars ?? undefined, i.particulars, null);
            });
            const close = !exact ? candidates.find((i) => {
              const iDateStr = i.incomeDate.toISOString().slice(0, 10);
              const dayDiff = Math.abs(new Date(btDate).getTime() - new Date(iDateStr).getTime()) / 86400000;
              return dayDiff <= 2;
            }) : undefined;
            const amountOnly = !exact && !close ? candidates[0] : undefined;

            const match = exact ?? close ?? amountOnly;
            if (match) {
              const confidence = exact ? "exact" : close ? "close" : "amount_only";
              matchOps.push({ bankTxnId: bt.id, incomeId: match.id, confidence });
              matchedIncIds.add(match.id);
            }
          }
        }
      }

      if (matchOps.length > 0) {
        await db.transaction(async (tx) => {
          for (const op of matchOps) {
            await tx.update(bankTransactions).set({
              reconciliationStatus: "matched",
              matchedExpenseId: op.expenseId ?? null,
              matchedIncomeId: op.incomeId ?? null,
              matchConfidence: op.confidence,
              matchedAt: new Date(),
            }).where(eq(bankTransactions.id, op.bankTxnId));

            if (op.expenseId) {
              await tx.update(expenses).set({ bankTransactionId: op.bankTxnId }).where(eq(expenses.id, op.expenseId));
            }
            if (op.incomeId) {
              await tx.update(incomeRecords).set({ bankTransactionId: op.bankTxnId }).where(eq(incomeRecords.id, op.incomeId));
            }
          }
        });
      }

      res.json({ matched: matchOps.length });
    } catch (e) {
      logger.error("Reconciliation auto-match error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to auto-match" });
    }
  });

  app.post("/api/admin/reconciliation/ai-suggest", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const dates = reconDateRange(req, res); if (!dates) return;
      const { startDate, endDate } = dates;

      const unmatchedBankTxns = await db.select({
        id: bankTransactions.id, transactionDate: bankTransactions.transactionDate,
        particulars: bankTransactions.particulars, amount: bankTransactions.amount, type: bankTransactions.type,
      }).from(bankTransactions).where(and(
        eq(bankTransactions.tenantId, tid), eq(bankTransactions.reconciliationStatus, "unmatched"),
        sql`${bankTransactions.transactionDate} >= ${startDate}::date`,
        sql`${bankTransactions.transactionDate} <= ${endDate}::date`,
      )).limit(50);

      const unmatchedExp = await db.select({
        id: expenses.id, amount: expenses.amount, expenseDate: expenses.expenseDate,
        description: expenses.description, vendorName: expenses.vendorName, particulars: expenses.particulars,
      }).from(expenses).where(and(
        eq(expenses.tenantId, tid), isNull(expenses.bankTransactionId),
        sql`${expenses.expenseDate} >= ${shiftDate(startDate, -10)}::date`,
        sql`${expenses.expenseDate} <= ${shiftDate(endDate, 10)}::date`,
      )).limit(50);

      const unmatchedInc = await db.select({
        id: incomeRecords.id, amount: incomeRecords.amount, incomeDate: incomeRecords.incomeDate,
        particulars: incomeRecords.particulars,
      }).from(incomeRecords).where(and(
        eq(incomeRecords.tenantId, tid), isNull(incomeRecords.bankTransactionId),
        sql`${incomeRecords.incomeDate} >= ${shiftDate(startDate, -10)}::date`,
        sql`${incomeRecords.incomeDate} <= ${shiftDate(endDate, 10)}::date`,
      )).limit(50);

      const { suggestBankReconciliationMatches } = await import("../lib/reconciliation-suggestions.js");
      const suggestions = await suggestBankReconciliationMatches(
        unmatchedBankTxns.map((bt) => ({
          id: bt.id, amount: bt.amount, type: bt.type,
          transactionDate: bt.transactionDate.toISOString().slice(0, 10),
          particulars: bt.particulars,
        })),
        unmatchedExp.map((e) => ({
          id: e.id, amount: e.amount,
          expenseDate: e.expenseDate.toISOString().slice(0, 10),
          vendorName: e.vendorName, description: e.description, particulars: e.particulars,
        })),
        unmatchedInc.map((i) => ({
          id: i.id, amount: i.amount,
          incomeDate: i.incomeDate.toISOString().slice(0, 10),
          particulars: i.particulars,
        })),
      );

      res.json({ suggestions });
    } catch (e) {
      logger.error("Reconciliation AI suggest error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  app.post("/api/admin/reconciliation/match", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const { bankTransactionId: btId, expenseId: eId, incomeId: iId } = req.body;
      if (!btId || typeof btId !== "string") return res.status(400).json({ error: "bankTransactionId required" });
      if (!eId && !iId) return res.status(400).json({ error: "expenseId or incomeId required" });

      const [bt] = await db.select().from(bankTransactions).where(and(eq(bankTransactions.id, btId), eq(bankTransactions.tenantId, tid)));
      if (!bt) return res.status(404).json({ error: "Bank transaction not found" });

      await db.transaction(async (tx) => {
        await tx.update(bankTransactions).set({
          reconciliationStatus: "matched",
          matchedExpenseId: eId ?? null,
          matchedIncomeId: iId ?? null,
          matchConfidence: "manual",
          matchedAt: new Date(),
          matchedById: req.user?.id || null,
        }).where(eq(bankTransactions.id, btId));

        if (eId) {
          await tx.update(expenses).set({ bankTransactionId: btId }).where(eq(expenses.id, eId));
        }
        if (iId) {
          await tx.update(incomeRecords).set({ bankTransactionId: btId }).where(eq(incomeRecords.id, iId));
        }
      });

      res.json({ success: true });
    } catch (e) {
      logger.error("Reconciliation match error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to match" });
    }
  });

  app.post("/api/admin/reconciliation/unmatch", requireAdmin, async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const { bankTransactionId: btId } = req.body;
      if (!btId || typeof btId !== "string") return res.status(400).json({ error: "bankTransactionId required" });

      const [bt] = await db.select().from(bankTransactions).where(and(eq(bankTransactions.id, btId), eq(bankTransactions.tenantId, tid)));
      if (!bt) return res.status(404).json({ error: "Bank transaction not found" });

      await db.transaction(async (tx) => {
        if (bt.matchedExpenseId) {
          await tx.update(expenses).set({ bankTransactionId: null }).where(eq(expenses.id, bt.matchedExpenseId));
        }
        if (bt.matchedIncomeId) {
          await tx.update(incomeRecords).set({ bankTransactionId: null }).where(eq(incomeRecords.id, bt.matchedIncomeId));
        }
        await tx.update(bankTransactions).set({
          reconciliationStatus: "unmatched",
          matchedExpenseId: null,
          matchedIncomeId: null,
          matchConfidence: null,
          matchedAt: null,
          matchedById: null,
        }).where(eq(bankTransactions.id, btId));
      });

      res.json({ success: true });
    } catch (e) {
      logger.error("Reconciliation unmatch error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to unmatch" });
    }
  });

  app.post("/api/admin/reconciliation/import", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const tid = reconTenantId(req, res); if (!tid) return;
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "No file uploaded" });

      const expCats = await db.select({ slug: expenseCategories.slug }).from(expenseCategories).where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
      const incCats = await db.select({ slug: incomeCategories.slug }).from(incomeCategories).where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));

      const { expenses: expRows, income: incRows } = parseBankStatementCsv(
        file.buffer,
        expCats.map((c) => c.slug),
        incCats.length > 0 ? incCats.map((c) => c.slug) : ["other"]
      );

      const importBatchId = crypto.randomUUID();
      const toDate = (dateStr: string): Date => {
        const d = new Date(dateStr + "T12:00:00Z");
        if (isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dateStr}`);
        return d;
      };

      const bankTxnInserts: Array<{
        tenantId: string; transactionDate: Date; particulars: string;
        amount: number; type: string; importBatchId: string;
      }> = [];

      for (const r of expRows) {
        if (!isValidDateString(r.date)) continue;
        bankTxnInserts.push({
          tenantId: tid, transactionDate: toDate(r.date),
          particulars: r.particulars || "Bank import", amount: r.amount,
          type: "debit", importBatchId,
        });
      }
      for (const r of incRows) {
        if (!isValidDateString(r.date)) continue;
        bankTxnInserts.push({
          tenantId: tid, transactionDate: toDate(r.date),
          particulars: r.particulars || "Bank import", amount: r.amount,
          type: "credit", importBatchId,
        });
      }

      let importedCount = 0;
      if (bankTxnInserts.length > 0) {
        await db.transaction(async (tx) => {
          for (let i = 0; i < bankTxnInserts.length; i += 250) {
            const chunk = bankTxnInserts.slice(i, i + 250);
            await tx.insert(bankTransactions).values(chunk);
            importedCount += chunk.length;
          }
        });
      }

      res.json({ imported: importedCount, importBatchId });
    } catch (e) {
      logger.error("Reconciliation import error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to import bank statement" });
    }
  });

  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { startDate, endDate, costCenterId, granularity } = req.query;
      if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
        return res.status(400).json({ error: "startDate and endDate required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
      }
      if (startDate > endDate) return res.status(400).json({ error: "startDate must be before or equal to endDate" });
      const filters = {
        tenantId: tid,
        startDate,
        endDate,
        costCenterId: (costCenterId as string) ?? undefined,
        granularity: (granularity as "day" | "week" | "month") ?? "day",
      };
      const data = await getAnalytics(filters);
      res.json(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isValidation =
        msg === "startDate and endDate must be YYYY-MM-DD" || msg === "startDate must be before or equal to endDate";
      if (isValidation) return res.status(400).json({ error: msg });
      logger.error("Analytics error", { requestId: req.requestId, err: msg });
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/admin/analytics/insights", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { startDate, endDate, costCenterId, granularity } = req.query;
      if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
        return res.status(400).json({ error: "startDate and endDate required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
      }
      if (startDate > endDate) return res.status(400).json({ error: "startDate must be before or equal to endDate" });
      const filters = {
        tenantId: tid,
        startDate,
        endDate,
        costCenterId: (costCenterId as string) ?? undefined,
        granularity: (granularity as "day" | "week" | "month") ?? "day",
      };
      const data = await getAnalytics(filters);
      const summary = {
        totalExpenses: data.kpis.totalExpenses,
        totalIncome: data.kpis.totalIncome,
        netCashflow: data.kpis.netCashflow,
        expenseTrend: data.comparison.expenseTrend,
        incomeTrend: data.comparison.incomeTrend,
        prevTotalExpenses: data.comparison.prevTotalExpenses,
        prevTotalIncome: data.comparison.prevTotalIncome,
        topExpenseCategories: (data.expensesByCategory ?? []).slice(0, 5).map((c) => ({ name: c.name, amount: c.amount })),
        topCostCenters: (data.expensesByCostCenter ?? []).slice(0, 5).map((c) => ({ name: c.name, amount: c.amount })),
        startDate,
        endDate,
      };
      const insights = await generateAnalyticsInsights(summary);
      res.json({ insights: insights ?? null });
    } catch (e) {
      logger.error("Analytics insights error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.get("/api/admin/analytics/predictions", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const parsed = req.query?.horizonDays ? parseInt(String(req.query.horizonDays), 10) : 30;
      const horizonDays = Math.min(90, Math.max(1, isNaN(parsed) ? 30 : parsed));
      const costCenterId = req.query?.costCenterId ? String(req.query.costCenterId) : undefined;
      const data = await getPredictions({ tenantId: tid, horizonDays, costCenterId });
      const predictionData = data as Record<string, unknown>;
      logger.info("Predictions generated", {
        requestId: req.requestId,
        tenantId: tid,
        horizonDays,
        costCenterId: costCenterId ?? "all",
        engine: predictionData.engine ?? "unknown",
        model: predictionData.model ?? "unknown",
        accuracyTelemetry: predictionData.accuracyTelemetry ?? null,
      });
      res.json(data);
    } catch (e) {
      logger.error("Predictions error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch predictions" });
    }
  });

  // ── MIS Reports ──

  app.get("/api/admin/mis/report", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const fy = (req.query?.fy as string) ?? "";
      if (!/^\d{4}-\d{2}$/.test(fy)) return res.status(400).json({ error: "fy must be YYYY-YY format, e.g. 2025-26" });
      const data = await getMISReport(tid, fy);
      res.json(data);
    } catch (e) {
      logger.error("MIS report error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to generate MIS report" });
    }
  });

  app.get("/api/admin/mis/transactions", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const fy = (req.query?.fy as string) ?? "";
      const type = (req.query?.type as string) ?? "expense";
      const categorySlug = (req.query?.categorySlug as string) ?? "";
      const monthIdx = parseInt((req.query?.monthIdx as string) ?? "0", 10);
      if (!/^\d{4}-\d{2}$/.test(fy)) return res.status(400).json({ error: "fy must be YYYY-YY format" });
      if (type !== "expense" && type !== "income") return res.status(400).json({ error: "type must be expense or income" });
      if (!categorySlug) return res.status(400).json({ error: "categorySlug required" });
      if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return res.status(400).json({ error: "monthIdx must be 0-11" });
      const rows = await getMISCellTransactions(tid, fy, type as "expense" | "income", categorySlug, monthIdx);
      res.json(rows);
    } catch (e) {
      logger.error("MIS transactions error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/admin/mis/export", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? (req.query?.tenantId as string);
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const fy = (req.query?.fy as string) ?? "";
      if (!/^\d{4}-\d{2}$/.test(fy)) return res.status(400).json({ error: "fy must be YYYY-YY format" });

      const data = await getMISReport(tid, fy);
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const months = data.months;
      const headerRow = ["Particulars", ...months, data.fyLabel];

      function lineToRow(line: { label: string; values: number[]; fyTotal: number }) {
        return [line.label, ...line.values, line.fyTotal];
      }
      function numRow(label: string, vals: number[]) {
        return [label, ...vals, vals.reduce((a, b) => a + b, 0)];
      }

      // Cashflow Statement
      const cfRows: (string | number)[][] = [headerRow];
      cfRows.push(numRow("Opening Balance", data.cashflow.openingBalance));
      cfRows.push(["Inflow", ...new Array(months.length + 1).fill("")]);
      for (const item of data.cashflow.inflows) cfRows.push(lineToRow(item));
      cfRows.push(lineToRow(data.cashflow.totalIncome));
      cfRows.push(["Outflow", ...new Array(months.length + 1).fill("")]);
      for (const item of data.cashflow.outflows) cfRows.push(lineToRow(item));
      cfRows.push(lineToRow(data.cashflow.totalOutflow));
      cfRows.push(lineToRow(data.cashflow.netOperating));
      cfRows.push([""]);
      cfRows.push(["Cash Flows from Investing Activities", ...new Array(months.length + 1).fill("")]);
      for (const item of data.cashflow.investingActivities) cfRows.push(lineToRow(item));
      cfRows.push(lineToRow(data.cashflow.netInvesting));
      cfRows.push([""]);
      cfRows.push(lineToRow(data.cashflow.netCashFlow));
      cfRows.push(numRow("Closing Balance", data.cashflow.closingBalance));
      const cfSheet = XLSX.utils.aoa_to_sheet(cfRows);
      cfSheet["!cols"] = [{ wch: 45 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, cfSheet, "Cashflow Statement");

      // Profit and Loss
      const plRows: (string | number)[][] = [headerRow];
      plRows.push(lineToRow(data.pnl.revenueOffline));
      plRows.push(lineToRow(data.pnl.revenueMedico));
      plRows.push(lineToRow(data.pnl.totalRevenue));
      plRows.push([""]);
      plRows.push(lineToRow(data.pnl.totalDirectExpenses));
      plRows.push(lineToRow(data.pnl.grossProfit));
      plRows.push(["Gross Profit (%)", ...data.pnl.grossProfitPct, ""]);
      plRows.push([""]);
      plRows.push(lineToRow(data.pnl.otherIncome));
      plRows.push([""]);
      plRows.push(["Indirect Expenses", ...new Array(months.length + 1).fill("")]);
      for (const item of data.pnl.indirectExpenses) plRows.push(lineToRow(item));
      plRows.push(lineToRow(data.pnl.totalIndirectExpenses));
      plRows.push([""]);
      plRows.push(lineToRow(data.pnl.ebitda));
      plRows.push(["EBITDA (%)", ...data.pnl.ebitdaPct, ""]);
      const plSheet = XLSX.utils.aoa_to_sheet(plRows);
      plSheet["!cols"] = [{ wch: 45 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, plSheet, "Profit and Loss");

      // Direct Expenses
      const deRows: (string | number)[][] = [headerRow];
      for (const item of data.pnl.directExpenses) deRows.push(lineToRow(item));
      deRows.push(lineToRow(data.pnl.totalDirectExpenses));
      const deSheet = XLSX.utils.aoa_to_sheet(deRows);
      deSheet["!cols"] = [{ wch: 45 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, deSheet, "Direct Expenses");

      // Revenue (Offline) by center
      const roRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.revenueByCenter) roRows.push(lineToRow(item));
      roRows.push(lineToRow(data.drilldowns.totalRevenueByCenter));
      const roSheet = XLSX.utils.aoa_to_sheet(roRows);
      roSheet["!cols"] = [{ wch: 30 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, roSheet, "Revenue (Offline)");

      // Other Indirect Expenses
      const oiRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.otherIndirect) oiRows.push(lineToRow(item));
      oiRows.push(lineToRow(data.drilldowns.totalOtherIndirect));
      const oiSheet = XLSX.utils.aoa_to_sheet(oiRows);
      oiSheet["!cols"] = [{ wch: 45 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, oiSheet, "Other Indirect expenses");

      // Payroll Expenses
      const prRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.payrollBreakdown) prRows.push(lineToRow(item));
      prRows.push(lineToRow(data.drilldowns.totalPayroll));
      const prSheet = XLSX.utils.aoa_to_sheet(prRows);
      prSheet["!cols"] = [{ wch: 35 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, prSheet, "Payroll Expenses");

      // Electricity Charges
      const ecRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.electricityByCenter) ecRows.push(lineToRow(item));
      ecRows.push(lineToRow(data.drilldowns.totalElectricity));
      const ecSheet = XLSX.utils.aoa_to_sheet(ecRows);
      ecSheet["!cols"] = [{ wch: 25 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ecSheet, "Electricity Charges");

      // Marketing Expenses
      const meRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.marketingByType) meRows.push(lineToRow(item));
      meRows.push(lineToRow(data.drilldowns.totalMarketing));
      const meSheet = XLSX.utils.aoa_to_sheet(meRows);
      meSheet["!cols"] = [{ wch: 30 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, meSheet, "Marketing Expenses");

      // Food Expenses
      const feRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.foodByCenter) feRows.push(lineToRow(item));
      feRows.push(lineToRow(data.drilldowns.totalFood));
      const feSheet = XLSX.utils.aoa_to_sheet(feRows);
      feSheet["!cols"] = [{ wch: 25 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, feSheet, "Food Expenses");

      // Capital Expenditure
      const ceRows: (string | number)[][] = [headerRow];
      for (const item of data.drilldowns.capexByType) ceRows.push(lineToRow(item));
      ceRows.push(lineToRow(data.drilldowns.totalCapex));
      const ceSheet = XLSX.utils.aoa_to_sheet(ceRows);
      ceSheet["!cols"] = [{ wch: 35 }, ...months.map(() => ({ wch: 15 })), { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ceSheet, "Capital Expenditure");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="MIS_${fy}.xlsx"`);
      res.send(buf);
    } catch (e) {
      logger.error("MIS export error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to export MIS" });
    }
  });

  // Expense categories
  app.get("/api/admin/expense-categories", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const includeInactive = req.query?.includeInactive === "true";
      const conditions = [or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))];
      if (!includeInactive) conditions.push(eq(expenseCategories.isActive, true));

      const creatorTable = aliasedTable(users, "creator");
      const updaterTable = aliasedTable(users, "updater");

      const rows = await db
        .select({
          id: expenseCategories.id,
          tenantId: expenseCategories.tenantId,
          name: expenseCategories.name,
          slug: expenseCategories.slug,
          parentId: expenseCategories.parentId,
          displayOrder: expenseCategories.displayOrder,
          cashflowLabel: expenseCategories.cashflowLabel,
          isActive: expenseCategories.isActive,
          createdAt: expenseCategories.createdAt,
          updatedAt: expenseCategories.updatedAt,
          createdByName: creatorTable.name,
          updatedByName: updaterTable.name,
        })
        .from(expenseCategories)
        .leftJoin(creatorTable, eq(expenseCategories.createdById, creatorTable.id))
        .leftJoin(updaterTable, eq(expenseCategories.updatedById, updaterTable.id))
        .where(and(...conditions))
        .orderBy(expenseCategories.displayOrder, expenseCategories.name);
      res.json(rows);
    } catch (e) {
      logger.error("Expense categories error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch expense categories" });
    }
  });

  app.post("/api/admin/expense-categories", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { name, slug, cashflowLabel, displayOrder } = req.body;
      if (!name || !slug || !cashflowLabel) return res.status(400).json({ error: "name, slug, and cashflowLabel required" });
      const slugNorm = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const [created] = await db
        .insert(expenseCategories)
        .values({
          tenantId: tid,
          name,
          slug: slugNorm || slug,
          cashflowLabel: cashflowLabel || name,
          displayOrder: displayOrder ?? 0,
          isActive: true,
          createdById: user?.id || null,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Category slug already exists" });
      logger.error("Expense category create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/expense-categories/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      const tid = tenantId ?? req.body?.tenantId;
      const { name, slug, cashflowLabel, displayOrder, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || slug;
      if (cashflowLabel !== undefined) updates.cashflowLabel = cashflowLabel;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (isActive !== undefined) updates.isActive = isActive;
      updates.updatedById = user?.id || null;
      const whereClause = tid ? and(eq(expenseCategories.id, req.params.id), eq(expenseCategories.tenantId, tid)) : eq(expenseCategories.id, req.params.id);
      const [updated] = await db.update(expenseCategories).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      logger.error("Expense category update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/admin/expense-categories/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rawTid = tenantId ?? req.query?.tenantId;
      const tid = typeof rawTid === "string" ? rawTid : undefined;
      const whereClause = tid ? and(eq(expenseCategories.id, req.params.id), eq(expenseCategories.tenantId, tid)) : eq(expenseCategories.id, req.params.id);
      const expenseConditions = [eq(expenses.categoryId, req.params.id)];
      if (tid) expenseConditions.push(eq(expenses.tenantId, tid));
      const [existing] = await db.select({ id: expenses.id }).from(expenses).where(and(...expenseConditions)).limit(1);
      if (existing) return res.status(400).json({ error: "Category has expenses and cannot be deleted" });
      const [deleted] = await db.delete(expenseCategories).where(whereClause).returning();
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Expense category delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.post("/api/admin/expense-categories/seed", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const defaults = [
        { name: "Office Supplies", slug: "office_supplies", cashflowLabel: "Office Supplies", displayOrder: 0 },
        { name: "Travel", slug: "travel", cashflowLabel: "Travel", displayOrder: 1 },
        { name: "Utilities", slug: "utilities", cashflowLabel: "Utilities", displayOrder: 2 },
        { name: "Rent", slug: "rent", cashflowLabel: "Rent", displayOrder: 3 },
        { name: "Miscellaneous", slug: "miscellaneous", cashflowLabel: "Miscellaneous", displayOrder: 4 },
      ];
      let created = 0;
      let skipped = 0;
      for (const d of defaults) {
        const [existing] = await db.select({ id: expenseCategories.id }).from(expenseCategories).where(and(eq(expenseCategories.tenantId, tid), eq(expenseCategories.slug, d.slug))).limit(1);
        if (existing) {
          skipped++;
          continue;
        }
        await db.insert(expenseCategories).values({ tenantId: tid, ...d, isActive: true });
        created++;
      }
      res.json({ created, skipped });
    } catch (e) {
      logger.error("Expense category seed error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to seed" });
    }
  });

  // Recurring expense templates
  app.get("/api/admin/recurring-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const isActive = req.query?.isActive;
      const filters = isActive !== undefined ? { isActive: isActive === "true" } : undefined;
      const finJoeData = createFinJoeData(db, tid);
      const rows = await finJoeData.listRecurringTemplates(filters);
      res.json(rows);
    } catch (e) {
      logger.error("Recurring templates list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch recurring templates" });
    }
  });

  app.post("/api/admin/recurring-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { costCenterId, categoryId, amount, description, vendorName, gstin, taxType, invoiceNumber, voucherNumber, frequency, dayOfMonth, dayOfWeek, startDate, endDate } = req.body;
      const amountNum = typeof amount === "number" ? Math.round(amount) : parseInt(String(amount ?? 0), 10);
      if (!categoryId || typeof categoryId !== "string") return res.status(400).json({ error: "categoryId required" });
      if (amountNum <= 0) return res.status(400).json({ error: "amount must be positive" });
      const freq = String(frequency ?? "monthly").toLowerCase() as "monthly" | "weekly" | "quarterly";
      if (!["monthly", "weekly", "quarterly"].includes(freq)) return res.status(400).json({ error: "frequency must be monthly, weekly, or quarterly" });
      const startDateStr = typeof startDate === "string" ? startDate : new Date().toISOString().slice(0, 10);
      const costCenterIdNorm = costCenterId === "__corporate__" || costCenterId === "null" || !costCenterId ? null : costCenterId;
      const finJoeData = createFinJoeData(db, tid);
      const result = await finJoeData.createRecurringTemplate({
        tenantId: tid,
        costCenterId: costCenterIdNorm,
        categoryId,
        amount: amountNum,
        description: description ? String(description) : null,
        vendorName: vendorName ? String(vendorName) : null,
        gstin: gstin ? String(gstin) : null,
        taxType: taxType ? String(taxType) : null,
        invoiceNumber: invoiceNumber ? String(invoiceNumber) : null,
        voucherNumber: voucherNumber ? String(voucherNumber) : null,
        frequency: freq,
        dayOfMonth: dayOfMonth != null ? Math.min(31, Math.max(1, Number(dayOfMonth))) : undefined,
        dayOfWeek: dayOfWeek != null ? Math.min(6, Math.max(0, Number(dayOfWeek))) : undefined,
        startDate: startDateStr,
        endDate: endDate ? String(endDate) : null,
        createdById: (req.user as Express.User)?.id ?? null,
      });
      if (result && "error" in result) return res.status(400).json({ error: result.error });
      if (!result?.id) return res.status(500).json({ error: "Failed to create recurring template" });
      res.status(201).json({ id: result.id });
    } catch (e) {
      logger.error("Recurring template create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create recurring template" });
    }
  });

  app.patch("/api/admin/recurring-templates/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { amount, description, vendorName, gstin, taxType, invoiceNumber, voucherNumber, frequency, dayOfMonth, dayOfWeek, endDate, isActive } = req.body;
      const updates: Record<string, unknown> = {};
      if (amount !== undefined) updates.amount = Math.round(Number(amount));
      if (description !== undefined) updates.description = description ? String(description) : null;
      if (vendorName !== undefined) updates.vendorName = vendorName ? String(vendorName) : null;
      if (gstin !== undefined) updates.gstin = gstin ? String(gstin) : null;
      if (taxType !== undefined) updates.taxType = taxType ? String(taxType) : null;
      if (invoiceNumber !== undefined) updates.invoiceNumber = invoiceNumber ? String(invoiceNumber) : null;
      if (voucherNumber !== undefined) updates.voucherNumber = voucherNumber ? String(voucherNumber) : null;
      if (frequency !== undefined) {
        const f = String(frequency).toLowerCase();
        if (["monthly", "weekly", "quarterly"].includes(f)) updates.frequency = f;
      }
      if (dayOfMonth !== undefined) updates.dayOfMonth = Math.min(31, Math.max(1, Number(dayOfMonth)));
      if (dayOfWeek !== undefined) updates.dayOfWeek = Math.min(6, Math.max(0, Number(dayOfWeek)));
      if (endDate !== undefined) updates.endDate = endDate ? String(endDate) : null;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      updates.updatedById = user?.id || null;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const finJoeData = createFinJoeData(db, tid);
      const result = await finJoeData.updateRecurringTemplate(req.params.id, updates as any);
      if (!result) return res.status(404).json({ error: "Recurring template not found" });
      res.json({ id: result.id });
    } catch (e) {
      logger.error("Recurring template update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update recurring template" });
    }
  });

  app.delete("/api/admin/recurring-templates/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const finJoeData = createFinJoeData(db, tid);
      const deleted = await finJoeData.deleteRecurringTemplate(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Recurring template not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Recurring template delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete recurring template" });
    }
  });

  // Recurring income templates
  app.get("/api/admin/recurring-income-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const isActive = req.query?.isActive;
      const filters = isActive !== undefined ? { isActive: isActive === "true" } : undefined;
      const finJoeData = createFinJoeData(db, tid);
      const rows = await finJoeData.listRecurringIncomeTemplates(filters);
      res.json(rows);
    } catch (e) {
      logger.error("Recurring income templates list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch recurring income templates" });
    }
  });

  app.post("/api/admin/recurring-income-templates", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { costCenterId, categoryId, amount, particulars, incomeType, frequency, dayOfMonth, dayOfWeek, startDate, endDate } = req.body;
      const amountNum = typeof amount === "number" ? Math.round(amount) : parseInt(String(amount ?? 0), 10);
      if (!categoryId || typeof categoryId !== "string") return res.status(400).json({ error: "categoryId required" });
      if (amountNum <= 0) return res.status(400).json({ error: "amount must be positive" });
      const freq = String(frequency ?? "monthly").toLowerCase() as "monthly" | "weekly" | "quarterly";
      if (!["monthly", "weekly", "quarterly"].includes(freq)) return res.status(400).json({ error: "frequency must be monthly, weekly, or quarterly" });
      const startDateStr = typeof startDate === "string" ? startDate : new Date().toISOString().slice(0, 10);
      const costCenterIdNorm = costCenterId === "__corporate__" || costCenterId === "null" || !costCenterId ? null : costCenterId;
      const finJoeData = createFinJoeData(db, tid);
      const result = await finJoeData.createRecurringIncomeTemplate({
        tenantId: tid,
        costCenterId: costCenterIdNorm,
        categoryId,
        amount: amountNum,
        particulars: particulars ? String(particulars) : null,
        incomeType: incomeType ? String(incomeType) : "other",
        frequency: freq,
        dayOfMonth: dayOfMonth != null ? Math.min(31, Math.max(1, Number(dayOfMonth))) : undefined,
        dayOfWeek: dayOfWeek != null ? Math.min(6, Math.max(0, Number(dayOfWeek))) : undefined,
        startDate: startDateStr,
        endDate: endDate ? String(endDate) : null,
        createdById: (req.user as Express.User)?.id ?? null,
      });
      if (!result?.id) return res.status(500).json({ error: "Failed to create recurring income template" });
      res.status(201).json({ id: result.id });
    } catch (e) {
      logger.error("Recurring income template create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create recurring income template" });
    }
  });

  app.patch("/api/admin/recurring-income-templates/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { amount, particulars, incomeType, frequency, dayOfMonth, dayOfWeek, endDate, isActive } = req.body;
      const updates: Record<string, unknown> = {};
      if (amount !== undefined) updates.amount = Math.round(Number(amount));
      if (particulars !== undefined) updates.particulars = particulars ? String(particulars) : null;
      if (incomeType !== undefined) updates.incomeType = incomeType ? String(incomeType) : "other";
      if (frequency !== undefined) {
        const f = String(frequency).toLowerCase();
        if (["monthly", "weekly", "quarterly"].includes(f)) updates.frequency = f;
      }
      if (dayOfMonth !== undefined) updates.dayOfMonth = Math.min(31, Math.max(1, Number(dayOfMonth)));
      if (dayOfWeek !== undefined) updates.dayOfWeek = Math.min(6, Math.max(0, Number(dayOfWeek)));
      if (endDate !== undefined) updates.endDate = endDate ? String(endDate) : null;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      updates.updatedById = user?.id || null;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const finJoeData = createFinJoeData(db, tid);
      const result = await finJoeData.updateRecurringIncomeTemplate(req.params.id, updates as any);
      if (!result) return res.status(404).json({ error: "Recurring income template not found" });
      res.json({ id: result.id });
    } catch (e) {
      logger.error("Recurring income template update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update recurring income template" });
    }
  });

  app.delete("/api/admin/recurring-income-templates/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const finJoeData = createFinJoeData(db, tid);
      const deleted = await finJoeData.deleteRecurringIncomeTemplate(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Recurring income template not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Recurring income template delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete recurring income template" });
    }
  });

  // Cron trigger (admin-only, runs job logic directly on server)
  app.post("/api/admin/cron/trigger", requireAdmin, async (req, res) => {
    const { job } = req.body;
    if (!job || typeof job !== "string") return res.status(400).json({ error: "job required (recurring-expenses, recurring-income, weekly-insights, backfill-embeddings)" });
    const validJobs = ["recurring-expenses", "recurring-income", "weekly-insights", "backfill-embeddings"];
    if (!validJobs.includes(job)) return res.status(400).json({ error: `job must be one of: ${validJobs.join(", ")}` });

    try {
      const result = await logCronRun(db, job, async () => {
        if (job === "recurring-expenses") {
          const today = new Date().toISOString().slice(0, 10);
          const r = await generateExpensesFromTemplates(db, today, pool);
          return { ok: true, job, generated: r.generated, errors: r.errors };
        }
        if (job === "recurring-income") {
          const today = new Date().toISOString().slice(0, 10);
          const r = await generateIncomeFromTemplates(db, today);
          return { ok: true, job, generated: r.generated, errors: r.errors };
        }
        if (job === "weekly-insights") {
          const r = await runWeeklyInsights();
          return { ok: true, job, ...r };
        }
        if (job === "backfill-embeddings") {
          const r = await runBackfillEmbeddings(pool);
          return { ok: true, job, ...r };
        }
        throw new Error("Unknown job");
      });
      return res.json(result);
    } catch (e) {
      const errMsg = String(e);
      logger.error("Cron trigger error", { requestId: req.requestId, job, err: errMsg });
      res.status(500).json({ error: "Failed to run cron job", details: errMsg });
    }
  });

  app.get("/api/admin/cron/history", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(50, parseInt(String(req.query?.limit ?? 20), 10) || 20);
      const jobFilter = req.query?.job as string | undefined;
      const validJobNames = ["recurring-expenses", "recurring-income", "weekly-insights", "backfill-embeddings"];
      const conditions = jobFilter && validJobNames.includes(jobFilter) ? [eq(cronRuns.jobName, jobFilter)] : [];
      const rows = await db
        .select()
        .from(cronRuns)
        .where(conditions.length > 0 ? and(...conditions) : sql`true`)
        .orderBy(desc(cronRuns.startedAt))
        .limit(limit);
      res.json(rows);
    } catch (e) {
      logger.error("Cron history error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch cron history" });
    }
  });

  // --- Bank import deduplication utilities ---
  type DuplicateInfo = {
    potentialDuplicate: boolean;
    matchConfidence?: "exact" | "probable";
    matchedExpenseId?: string;
    matchedExpenseStatus?: string;
    matchedExpenseSource?: string;
  };

  function findDuplicateExpenses(
    csvRows: Array<{ date: string; particulars: string; amount: number }>,
    existingExpenses: Array<{ id: string; amount: number; expenseDate: Date; description: string | null; vendorName: string | null; status: string; source: string }>
  ): DuplicateInfo[] {
    const byDateAmount = new Map<string, typeof existingExpenses>();
    for (const e of existingExpenses) {
      const key = `${e.expenseDate.toISOString().slice(0, 10)}|${e.amount}`;
      const arr = byDateAmount.get(key);
      if (arr) arr.push(e);
      else byDateAmount.set(key, [e]);
    }
    return csvRows.map((row) => {
      const key = `${row.date}|${row.amount}`;
      const candidates = byDateAmount.get(key);
      if (!candidates || candidates.length === 0) {
        const fuzzyKey1 = `${shiftDate(row.date, 1)}|${row.amount}`;
        const fuzzyKey2 = `${shiftDate(row.date, -1)}|${row.amount}`;
        const fuzzyCandidates = [...(byDateAmount.get(fuzzyKey1) ?? []), ...(byDateAmount.get(fuzzyKey2) ?? [])];
        if (fuzzyCandidates.length > 0) {
          const textMatch = fuzzyCandidates.find((e) => textsOverlap(row.particulars, e.description, e.vendorName));
          if (textMatch) return { potentialDuplicate: true, matchConfidence: "probable" as const, matchedExpenseId: textMatch.id, matchedExpenseStatus: textMatch.status, matchedExpenseSource: textMatch.source };
        }
        return { potentialDuplicate: false };
      }
      const exact = candidates.find((e) => textsOverlap(row.particulars, e.description, e.vendorName));
      if (exact) return { potentialDuplicate: true, matchConfidence: "exact" as const, matchedExpenseId: exact.id, matchedExpenseStatus: exact.status, matchedExpenseSource: exact.source };
      return { potentialDuplicate: true, matchConfidence: "probable" as const, matchedExpenseId: candidates[0].id, matchedExpenseStatus: candidates[0].status, matchedExpenseSource: candidates[0].source };
    });
  }

  function findDuplicateIncome(
    csvRows: Array<{ date: string; particulars: string; amount: number }>,
    existingIncome: Array<{ id: string; amount: number; incomeDate: Date; particulars: string | null; source: string }>
  ): DuplicateInfo[] {
    const byDateAmount = new Map<string, typeof existingIncome>();
    for (const e of existingIncome) {
      const key = `${e.incomeDate.toISOString().slice(0, 10)}|${e.amount}`;
      const arr = byDateAmount.get(key);
      if (arr) arr.push(e);
      else byDateAmount.set(key, [e]);
    }
    return csvRows.map((row) => {
      const key = `${row.date}|${row.amount}`;
      const candidates = byDateAmount.get(key);
      if (!candidates || candidates.length === 0) return { potentialDuplicate: false };
      const exact = candidates.find((e) => e.particulars && row.particulars && (e.particulars.toLowerCase().includes(row.particulars.toLowerCase().slice(0, 20)) || row.particulars.toLowerCase().includes(e.particulars.toLowerCase().slice(0, 20))));
      if (exact) return { potentialDuplicate: true, matchConfidence: "exact" as const, matchedExpenseId: exact.id, matchedExpenseStatus: "income", matchedExpenseSource: exact.source };
      return { potentialDuplicate: true, matchConfidence: "probable" as const, matchedExpenseId: candidates[0].id, matchedExpenseStatus: "income", matchedExpenseSource: candidates[0].source };
    });
  }

  function textsOverlap(particulars: string | undefined, description: string | null, vendorName: string | null): boolean {
    if (!particulars) return false;
    const p = particulars.toLowerCase();
    if (description) {
      const d = description.toLowerCase();
      if (d.includes(p.slice(0, 20)) || p.includes(d.slice(0, 20))) return true;
    }
    if (vendorName) {
      if (p.includes(vendorName.toLowerCase())) return true;
    }
    return false;
  }

  function shiftDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function getDateRange(rows: Array<{ date: string }>): { minDate: string; maxDate: string } | null {
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }

  // Expense/Income import from bank statement CSV
  app.post("/api/admin/expenses/import/preview", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "No file uploaded" });

      const expCats = await db.select({ slug: expenseCategories.slug }).from(expenseCategories).where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
      const incCats = await db.select({ slug: incomeCategories.slug }).from(incomeCategories).where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));
      const expSlugs = expCats.map((c) => c.slug);
      const incSlugs = incCats.length > 0 ? incCats.map((c) => c.slug) : ["other"];

      const { expenses: expRows, income: incRows, skippedZero } = parseBankStatementCsv(file.buffer, expSlugs, incSlugs);

      const totalExpAmount = expRows.reduce((s, r) => s + r.amount, 0);
      const totalIncAmount = incRows.reduce((s, r) => s + r.amount, 0);

      res.json({
        preview: expRows.map((r) => ({ date: r.date, particulars: r.particulars, amount: r.amount, majorHead: r.majorHead ?? "", branch: r.branch ?? "", categoryMatch: r.categoryMatch })),
        totalRows: expRows.length,
        totalAmount: totalExpAmount,
        incomePreview: incRows.map((r) => ({ date: r.date, particulars: r.particulars, amount: r.amount, categoryMatch: r.categoryMatch })),
        incomeTotalRows: incRows.length,
        incomeTotalAmount: totalIncAmount,
        skippedZero,
      });
    } catch (e) {
      logger.error("Import preview error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to parse CSV" });
    }
  });

  app.post("/api/admin/expenses/import/analyze", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "No file uploaded" });

      const expCats = await db.select({ id: expenseCategories.id, name: expenseCategories.name, slug: expenseCategories.slug }).from(expenseCategories).where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
      const incCats = await db.select({ id: incomeCategories.id, name: incomeCategories.name, slug: incomeCategories.slug }).from(incomeCategories).where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));
      const expSlugs = expCats.map((c) => c.slug);
      const incSlugs = incCats.length > 0 ? incCats.map((c) => c.slug) : ["other"];

      const { expenses: expRows, income: incRows, skippedZero } = parseBankStatementCsv(file.buffer, expSlugs, incSlugs);

      const totalExpAmount = expRows.reduce((s, r) => s + r.amount, 0);
      const totalIncAmount = incRows.reduce((s, r) => s + r.amount, 0);

      const { suggestedExpenseMappings, suggestedIncomeMappings, proposedNewCategories } = await analyzeImportSuggestions(
        expRows,
        incRows,
        expCats,
        incCats.length > 0 ? incCats : [{ id: "", name: "Other", slug: "other" }]
      );

      // Duplicate detection: query existing records in the CSV's date range
      let expDuplicates: DuplicateInfo[] = [];
      let incDuplicates: DuplicateInfo[] = [];
      const expDateRange = getDateRange(expRows);
      const incDateRange = getDateRange(incRows);
      if (expDateRange) {
        const minD = new Date(expDateRange.minDate + "T00:00:00Z");
        const maxD = new Date(expDateRange.maxDate + "T23:59:59Z");
        minD.setUTCDate(minD.getUTCDate() - 1);
        maxD.setUTCDate(maxD.getUTCDate() + 1);
        const existingExp = await db
          .select({ id: expenses.id, amount: expenses.amount, expenseDate: expenses.expenseDate, description: expenses.description, vendorName: expenses.vendorName, status: expenses.status, source: expenses.source })
          .from(expenses)
          .where(and(eq(expenses.tenantId, tid), gte(expenses.expenseDate, minD), lte(expenses.expenseDate, maxD)));
        expDuplicates = findDuplicateExpenses(expRows, existingExp);
      }
      if (incDateRange) {
        const minD = new Date(incDateRange.minDate + "T00:00:00Z");
        const maxD = new Date(incDateRange.maxDate + "T23:59:59Z");
        minD.setUTCDate(minD.getUTCDate() - 1);
        maxD.setUTCDate(maxD.getUTCDate() + 1);
        const existingInc = await db
          .select({ id: incomeRecords.id, amount: incomeRecords.amount, incomeDate: incomeRecords.incomeDate, particulars: incomeRecords.particulars, source: incomeRecords.source })
          .from(incomeRecords)
          .where(and(eq(incomeRecords.tenantId, tid), gte(incomeRecords.incomeDate, minD), lte(incomeRecords.incomeDate, maxD)));
        incDuplicates = findDuplicateIncome(incRows, existingInc);
      }

      res.json({
        preview: expRows.map((r, i) => ({ date: r.date, particulars: r.particulars, amount: r.amount, majorHead: r.majorHead ?? "", branch: r.branch ?? "", categoryMatch: r.categoryMatch, ...(expDuplicates[i] ?? {}) })),
        totalRows: expRows.length,
        totalAmount: totalExpAmount,
        incomePreview: incRows.map((r, i) => ({ date: r.date, particulars: r.particulars, amount: r.amount, categoryMatch: r.categoryMatch, ...(incDuplicates[i] ?? {}) })),
        incomeTotalRows: incRows.length,
        incomeTotalAmount: totalIncAmount,
        skippedZero,
        suggestedExpenseMappings,
        suggestedIncomeMappings,
        proposedNewCategories,
      });
    } catch (e) {
      logger.error("Import analyze error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to analyze CSV" });
    }
  });

  app.post("/api/admin/expenses/import/execute", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "No file uploaded" });

      let expenseOverrides: Record<string, string> = {};
      let incomeOverrides: Record<string, string> = {};
      let costCenterOverrides: Record<string, string | null> = {};
      let skipExpenseIndices = new Set<number>();
      let skipIncomeIndices = new Set<number>();
      try {
        if (req.body?.expenseOverrides && typeof req.body.expenseOverrides === "string") {
          expenseOverrides = JSON.parse(req.body.expenseOverrides) || {};
        }
        if (req.body?.incomeOverrides && typeof req.body.incomeOverrides === "string") {
          incomeOverrides = JSON.parse(req.body.incomeOverrides) || {};
        }
        if (req.body?.costCenterOverrides && typeof req.body.costCenterOverrides === "string") {
          costCenterOverrides = JSON.parse(req.body.costCenterOverrides) || {};
        }
        if (req.body?.skipExpenseIndices && typeof req.body.skipExpenseIndices === "string") {
          const arr = JSON.parse(req.body.skipExpenseIndices);
          if (Array.isArray(arr)) skipExpenseIndices = new Set(arr.map(Number));
        }
        if (req.body?.skipIncomeIndices && typeof req.body.skipIncomeIndices === "string") {
          const arr = JSON.parse(req.body.skipIncomeIndices);
          if (Array.isArray(arr)) skipIncomeIndices = new Set(arr.map(Number));
        }
      } catch (_) {}

      const expCats = await db.select({ id: expenseCategories.id, slug: expenseCategories.slug }).from(expenseCategories).where(and(eq(expenseCategories.isActive, true), or(eq(expenseCategories.tenantId, tid), isNull(expenseCategories.tenantId))));
      const incCats = await db.select({ id: incomeCategories.id, slug: incomeCategories.slug }).from(incomeCategories).where(and(eq(incomeCategories.tenantId, tid), eq(incomeCategories.isActive, true)));
      const costCentersList = await db.select({ id: costCenters.id, name: costCenters.name, slug: costCenters.slug }).from(costCenters).where(and(eq(costCenters.tenantId, tid), eq(costCenters.isActive, true)));
      const validExpCatIds = new Set(expCats.map((c) => c.id));
      const validIncCatIds = new Set(incCats.map((c) => c.id));
      const validCcIds = new Set(costCentersList.map((c) => c.id));

      const expSlugToId = Object.fromEntries(expCats.map((c) => [c.slug, c.id]));
      const incSlugToId = Object.fromEntries(incCats.map((c) => [c.slug, c.id]));
      const branchToCcId = (name: string | undefined): string | null => {
        if (!name?.trim()) return null;
        const n = name.trim().toLowerCase();
        const match = costCentersList.find((c) => c.name.toLowerCase() === n || c.slug.toLowerCase() === n);
        return match?.id ?? null;
      };

      const { expenses: expRows, income: incRows } = parseBankStatementCsv(file.buffer, expCats.map((c) => c.slug), incCats.length > 0 ? incCats.map((c) => c.slug) : ["other"]);

      if (expRows.length > 0 && expCats.length === 0) {
        return res.status(400).json({ error: "Expense rows found but no expense categories. Add categories in Expenses settings first." });
      }
      if (incRows.length > 0 && incCats.length === 0) {
        return res.status(400).json({ error: "Income rows found but no income categories. Add categories in Income settings first." });
      }

      const toDate = (dateStr: string): Date => {
        const d = new Date(dateStr + "T12:00:00Z");
        if (isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dateStr}`);
        return d;
      };

      const BATCH_SIZE = 250;
      const expToInsert: Array<{
        tenantId: string;
        costCenterId: string | null;
        categoryId: string;
        amount: number;
        expenseDate: Date;
        description: string;
        status: string;
        source: string;
      }> = [];
      for (let i = 0; i < expRows.length; i++) {
        if (skipExpenseIndices.has(i)) continue;
        const r = expRows[i];
        if (!isValidDateString(r.date)) continue;
        const overrideCat = expenseOverrides[String(i)];
        const categoryId = (overrideCat && validExpCatIds.has(overrideCat) ? overrideCat : null) ?? expSlugToId[r.categoryMatch] ?? expCats[0]?.id;
        if (!categoryId) continue;
        const overrideCc = costCenterOverrides[String(i)];
        const ccId = overrideCc !== undefined
          ? (overrideCc === null || overrideCc === "__corporate__" ? null : validCcIds.has(overrideCc) ? overrideCc : null)
          : branchToCcId(r.branch);
        expToInsert.push({
          tenantId: tid,
          costCenterId: ccId,
          categoryId,
          amount: r.amount,
          expenseDate: toDate(r.date),
          description: r.particulars || "Bank import",
          status: "draft",
          source: "bank_import",
        });
      }

      const defaultIncCatId = incCats[0]?.id;
      const incToInsert: Array<{
        tenantId: string;
        costCenterId: null;
        categoryId: string;
        amount: number;
        incomeDate: Date;
        particulars: string;
        incomeType: string;
        source: string;
      }> = [];
      for (let i = 0; i < incRows.length; i++) {
        if (skipIncomeIndices.has(i)) continue;
        const r = incRows[i];
        if (!isValidDateString(r.date)) continue;
        const overrideCat = incomeOverrides[String(i)];
        const categoryId = (overrideCat && validIncCatIds.has(overrideCat) ? overrideCat : null) ?? incSlugToId[r.categoryMatch] ?? defaultIncCatId;
        if (!categoryId) continue;
        incToInsert.push({
          tenantId: tid,
          costCenterId: null,
          categoryId,
          amount: r.amount,
          incomeDate: toDate(r.date),
          particulars: r.particulars || "Bank import",
          incomeType: "other",
          source: "bank_import",
        });
      }

      let imported = 0;
      let incomeImported = 0;
      const importBatchId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        for (let i = 0; i < expToInsert.length; i += BATCH_SIZE) {
          const chunk = expToInsert.slice(i, i + BATCH_SIZE);
          const insertedExpenses = await tx.insert(expenses).values(chunk).returning({ id: expenses.id });
          const bankTxnChunk = insertedExpenses.map((exp, j) => {
            const row = chunk[j];
            return {
              tenantId: tid,
              transactionDate: row.expenseDate,
              particulars: row.description,
              amount: row.amount,
              type: "debit" as const,
              importBatchId,
              reconciliationStatus: "auto_from_import" as const,
              matchedExpenseId: exp.id,
              matchConfidence: "exact" as const,
              matchedAt: new Date(),
            };
          });
          const insertedBankTxns = await tx.insert(bankTransactions).values(bankTxnChunk).returning({ id: bankTransactions.id });
          for (let j = 0; j < insertedBankTxns.length; j++) {
            await tx.update(expenses).set({ bankTransactionId: insertedBankTxns[j].id }).where(eq(expenses.id, insertedExpenses[j].id));
          }
          imported += chunk.length;
        }
        for (let i = 0; i < incToInsert.length; i += BATCH_SIZE) {
          const chunk = incToInsert.slice(i, i + BATCH_SIZE);
          const insertedIncome = await tx.insert(incomeRecords).values(chunk).returning({ id: incomeRecords.id });
          const bankTxnChunk = insertedIncome.map((inc, j) => {
            const row = chunk[j];
            return {
              tenantId: tid,
              transactionDate: row.incomeDate,
              particulars: row.particulars,
              amount: row.amount,
              type: "credit" as const,
              importBatchId,
              reconciliationStatus: "auto_from_import" as const,
              matchedIncomeId: inc.id,
              matchConfidence: "exact" as const,
              matchedAt: new Date(),
            };
          });
          const insertedBankTxns = await tx.insert(bankTransactions).values(bankTxnChunk).returning({ id: bankTransactions.id });
          for (let j = 0; j < insertedBankTxns.length; j++) {
            await tx.update(incomeRecords).set({ bankTransactionId: insertedBankTxns[j].id }).where(eq(incomeRecords.id, insertedIncome[j].id));
          }
          incomeImported += chunk.length;
        }
      });

      res.json({ imported, incomeImported, skippedExpenses: skipExpenseIndices.size, skippedIncome: skipIncomeIndices.size });
    } catch (e) {
      logger.error("Import execute error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to import" });
    }
  });

  app.get("/api/admin/expenses/import/template", requireAdmin, async (req, res) => {
    try {
      const csv = "Date,Particulars,Withdrawals,Deposits,A/C,Major Head,Branch\n01-01-2025,Sample payment,1000,0,,,HO\n02-01-2025,Sample deposit,0,5000,,,HO";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=expense-import-template.csv");
      res.send(csv);
    } catch (e) {
      logger.error("Import template error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  // Expenses
  app.get("/api/admin/expenses/vendor-suggestions", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const names = await listDistinctVendorNames(db, tid);
      res.json(names);
    } catch (e) {
      logger.error("Vendor suggestions error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch vendor suggestions" });
    }
  });

  app.get("/api/admin/expenses", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { campusId, costCenterId, status, categoryId, source, startDate, endDate, limit: limitParam, offset: offsetParam } = req.query;
      const conditions = [eq(expenses.tenantId, tid)];
      const ccId = (costCenterId ?? campusId) as string | undefined;
      if (ccId && ccId !== "all") {
        if (ccId === "null" || ccId === "corporate" || ccId === "__corporate__") {
          conditions.push(sql`${expenses.costCenterId} IS NULL`);
        } else {
          conditions.push(eq(expenses.costCenterId, ccId));
        }
      }
      if (status && status !== "all") conditions.push(eq(expenses.status, status as string));
      if (categoryId && categoryId !== "all") conditions.push(eq(expenses.categoryId, categoryId as string));
      if (source && source !== "all") conditions.push(eq(expenses.source, source as string));
      if (startDate && typeof startDate === "string") conditions.push(sql`${expenses.expenseDate} >= ${startDate}::date`);
      if (endDate && typeof endDate === "string") conditions.push(sql`${expenses.expenseDate} <= ${endDate}::date`);

      const whereClause = and(...conditions);
      const limit = Math.min(Math.max(1, parseInt(String(limitParam ?? LIST_PAGE_SIZE), 10) || LIST_PAGE_SIZE), LIST_PAGE_SIZE_MAX);
      const offset = Math.max(0, parseInt(String(offsetParam ?? 0), 10) || 0);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses)
        .where(whereClause);

      const submitterTable = aliasedTable(users, "submitter");
      const approverTable = aliasedTable(users, "approver");

      const rows = await db
        .select({
          id: expenses.id,
          tenantId: expenses.tenantId,
          costCenterId: expenses.costCenterId,
          categoryId: expenses.categoryId,
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          description: expenses.description,
          particulars: expenses.particulars,
          status: expenses.status,
          invoiceNumber: expenses.invoiceNumber,
          invoiceDate: expenses.invoiceDate,
          vendorName: expenses.vendorName,
          gstin: expenses.gstin,
          taxType: expenses.taxType,
          voucherNumber: expenses.voucherNumber,
          source: expenses.source,
          recurringTemplateId: expenses.recurringTemplateId,
          createdAt: expenses.createdAt,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          submittedByName: submitterTable.name,
          approvedByName: approverTable.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(submitterTable, eq(expenses.submittedById, submitterTable.id))
        .leftJoin(approverTable, eq(expenses.approvedById, approverTable.id))
        .where(whereClause)
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(limit)
        .offset(offset);

      const total = countRow?.count ?? 0;
      const result = rows.map((r) => ({
        ...r,
        campus: r.costCenterId ? { id: r.costCenterId, name: r.costCenterName, slug: "" } : null,
        costCenter: r.costCenterId ? { id: r.costCenterId, name: r.costCenterName, slug: "" } : null,
        category: r.categoryId ? { id: r.categoryId, name: r.categoryName, slug: "" } : null,
      }));
      res.json({ rows: result, total, limit, offset, hasMore: offset + rows.length < total });
    } catch (e) {
      logger.error("Expenses list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.get("/api/admin/expenses/export", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
        return res.status(400).json({ error: "startDate and endDate required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: "startDate must be before or equal to endDate" });
      }
      const rows = await db
        .select({
          id: expenses.id,
          tenantId: expenses.tenantId,
          costCenterId: expenses.costCenterId,
          categoryId: expenses.categoryId,
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          description: expenses.description,
          particulars: expenses.particulars,
          status: expenses.status,
          invoiceNumber: expenses.invoiceNumber,
          invoiceDate: expenses.invoiceDate,
          vendorName: expenses.vendorName,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(
          and(
            eq(expenses.tenantId, tid),
            sql`${expenses.expenseDate} >= ${startDate}::date`,
            sql`${expenses.expenseDate} <= ${endDate}::date`
          )
        )
        .orderBy(expenses.expenseDate, expenses.createdAt)
        .limit(EXPORT_ROW_LIMIT);
      const byCategoryMonth: Record<string, { category: string; month: string; amount: number; count: number }> = {};
      for (const r of rows) {
        const cat = r.categoryName || "Uncategorized";
        const month = new Date(r.expenseDate).toISOString().slice(0, 7);
        const key = `${cat}|${month}`;
        if (!byCategoryMonth[key]) byCategoryMonth[key] = { category: cat, month, amount: 0, count: 0 };
        byCategoryMonth[key].amount += r.amount ?? 0;
        byCategoryMonth[key].count += 1;
      }
      const lines = ["Category,Month,Amount,Count"];
      const sorted = Object.values(byCategoryMonth).sort((a, b) => a.category.localeCompare(b.category) || a.month.localeCompare(b.month));
      for (const v of sorted) {
        lines.push(`${escapeCsv(v.category)},${v.month},${v.amount},${v.count}`);
      }
      if (rows.length === EXPORT_ROW_LIMIT) {
        lines.push(`"Note: Export truncated to ${EXPORT_ROW_LIMIT} rows. Narrow date range for full data."`);
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=cashflow-summary-${startDate}-${endDate}.csv`);
      res.send("\uFEFF" + lines.join("\n"));
    } catch (e) {
      logger.error("Expense export error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to export" });
    }
  });

  app.get("/api/admin/expenses/export/detailed", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
        return res.status(400).json({ error: "startDate and endDate required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: "startDate must be before or equal to endDate" });
      }
      const submitterTable = aliasedTable(users, "submitter");
      const approverTable = aliasedTable(users, "approver");

      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          description: expenses.description,
          particulars: expenses.particulars,
          status: expenses.status,
          invoiceNumber: expenses.invoiceNumber,
          invoiceDate: expenses.invoiceDate,
          vendorName: expenses.vendorName,
          gstin: expenses.gstin,
          taxType: expenses.taxType,
          voucherNumber: expenses.voucherNumber,
          payoutMethod: expenses.payoutMethod,
          payoutRef: expenses.payoutRef,
          payoutAt: expenses.payoutAt,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
          submittedByName: submitterTable.name,
          approvedByName: approverTable.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(submitterTable, eq(expenses.submittedById, submitterTable.id))
        .leftJoin(approverTable, eq(expenses.approvedById, approverTable.id))
        .where(
          and(
            eq(expenses.tenantId, tid),
            sql`${expenses.expenseDate} >= ${startDate}::date`,
            sql`${expenses.expenseDate} <= ${endDate}::date`
          )
        )
        .orderBy(expenses.expenseDate, expenses.createdAt)
        .limit(EXPORT_ROW_LIMIT);
      const lines = [
        "Date,Cost Center,Category,Amount,Description,Particulars,Vendor,Invoice Number,Invoice Date,GSTIN,Tax Type,Voucher Number,Status,Payout Method,Payout Ref,Payout At,Requested By,Approved By",
      ];
      for (const r of rows) {
        const date = r.expenseDate ? new Date(r.expenseDate).toISOString().slice(0, 10) : "";
        const invDate = r.invoiceDate ? new Date(r.invoiceDate).toISOString().slice(0, 10) : "";
        const payoutAt = r.payoutAt ? new Date(r.payoutAt).toISOString().slice(0, 10) : "";
        lines.push(
          [
            date,
            escapeCsv(r.costCenterName ?? ""),
            escapeCsv(r.categoryName ?? ""),
            r.amount ?? 0,
            escapeCsv(r.description ?? r.particulars ?? ""),
            escapeCsv(r.particulars ?? ""),
            escapeCsv(r.vendorName ?? ""),
            escapeCsv(r.invoiceNumber ?? ""),
            invDate,
            escapeCsv(r.gstin ?? ""),
            escapeCsv(r.taxType ?? ""),
            escapeCsv(r.voucherNumber ?? ""),
            r.status ?? "",
            escapeCsv(r.payoutMethod ?? ""),
            escapeCsv(r.payoutRef ?? ""),
            payoutAt,
            escapeCsv(r.submittedByName ?? ""),
            escapeCsv(r.approvedByName ?? ""),
          ].join(",")
        );
      }
      if (rows.length === EXPORT_ROW_LIMIT) {
        lines.push(`"Note: Export truncated to ${EXPORT_ROW_LIMIT} rows. Narrow date range for full data."`);
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=expenses-detailed-${startDate}-${endDate}.csv`);
      res.send("\uFEFF" + lines.join("\n"));
    } catch (e) {
      logger.error("Expense detailed export error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to export" });
    }
  });

  app.post("/api/admin/expenses", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { campusId, costCenterId, categoryId, amount, expenseDate, description, invoiceNumber, invoiceDate, vendorName, gstin, taxType, voucherNumber } = req.body;
      const ccId = (costCenterId ?? campusId) && (costCenterId ?? campusId) !== "__corporate__" ? (costCenterId ?? campusId) : null;
      if (!categoryId || !amount || amount <= 0 || !expenseDate) return res.status(400).json({ error: "categoryId, amount (>0), and expenseDate required" });
      const [created] = await db
        .insert(expenses)
        .values({
          tenantId: tid,
          costCenterId: ccId,
          categoryId,
          amount: Math.round(Number(amount)),
          expenseDate: new Date(expenseDate),
          description: description || null,
          invoiceNumber: invoiceNumber || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          vendorName: vendorName || null,
          gstin: gstin || null,
          taxType: taxType || null,
          voucherNumber: voucherNumber || null,
          status: "draft",
          source: "manual",
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create" });
      res.status(201).json(created);
    } catch (e) {
      logger.error("Expense create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create" });
    }
  });

  app.patch("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { costCenterId, campusId, categoryId, amount, expenseDate, description, invoiceNumber, invoiceDate, vendorName, gstin, taxType, voucherNumber } = req.body;
      const ccId = (costCenterId ?? campusId) !== undefined ? ((costCenterId ?? campusId) && (costCenterId ?? campusId) !== "__corporate__" ? (costCenterId ?? campusId) : null) : undefined;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (ccId !== undefined) updates.costCenterId = ccId;
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (amount !== undefined) updates.amount = Math.round(Number(amount));
      if (expenseDate !== undefined) updates.expenseDate = new Date(expenseDate);
      if (description !== undefined) updates.description = description;
      if (invoiceNumber !== undefined) updates.invoiceNumber = invoiceNumber;
      if (invoiceDate !== undefined) updates.invoiceDate = invoiceDate ? new Date(invoiceDate) : null;
      if (vendorName !== undefined) updates.vendorName = vendorName;
      if (gstin !== undefined) updates.gstin = gstin;
      if (taxType !== undefined) updates.taxType = taxType;
      if (voucherNumber !== undefined) updates.voucherNumber = voucherNumber;
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const [updated] = await db.update(expenses).set(updates as any).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      logger.error("Expense update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft expenses can be deleted" });
      await db.delete(expenses).where(whereClause);
      res.status(204).send();
    } catch (e) {
      logger.error("Expense delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.post("/api/admin/expenses/:id/submit", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft expenses can be submitted" });
      const [updated] = await db.update(expenses).set({ status: "pending_approval", submittedAt: new Date(), submittedById: (req.user as any).id, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      // Notify finance about new expense needing approval
      try {
        const [row] = await db
          .select({
            amount: expenses.amount,
            vendorName: expenses.vendorName,
            description: expenses.description,
            categoryName: expenseCategories.name,
          })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(and(eq(expenses.id, updated.id), eq(expenses.tenantId, tid)))
          .limit(1);
        if (row) {
          await notifyFinanceForApproval(
            updated.id,
            { amount: row.amount, vendorName: row.vendorName, description: row.description },
            tid,
            req.requestId,
            row.categoryName ?? null
          );
        }
      } catch (notifyErr) {
        logger.error("Failed to notify finance for web submit", { requestId: req.requestId, err: String(notifyErr) });
      }
      res.json(updated);
    } catch (e) {
      logger.error("Expense submit error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to submit" });
    }
  });

  app.post("/api/admin/expenses/:id/approve", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status, amount: expenses.amount, vendorName: expenses.vendorName, categoryName: expenseCategories.name, costCenterName: costCenters.name }).from(expenses).leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id)).leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id)).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "pending_approval") return res.status(400).json({ error: "Only pending expenses can be approved" });
      const [updated] = await db.update(expenses).set({ status: "approved", approvedAt: new Date(), approvedById: (req.user as any).id, rejectionReason: null, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      const expCtx = { amount: existing.amount, vendorName: existing.vendorName, categoryName: existing.categoryName, costCenterName: existing.costCenterName };
      try {
        await notifySubmitterForApprovalRejectionFromExpense(updated.id, "approved", tid, undefined, req.requestId, expCtx);
      } catch (notifyErr) {
        logger.error("Failed to notify submitter for approval", { requestId: req.requestId, err: String(notifyErr) });
      }
      res.json(updated);
    } catch (e) {
      logger.error("Expense approve error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  app.post("/api/admin/expenses/:id/reject", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { reason } = req.body;
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status, amount: expenses.amount, vendorName: expenses.vendorName, categoryName: expenseCategories.name, costCenterName: costCenters.name }).from(expenses).leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id)).leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id)).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "pending_approval") return res.status(400).json({ error: "Only pending expenses can be rejected" });
      const [updated] = await db.update(expenses).set({ status: "rejected", rejectionReason: reason || null, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      const expCtx = { amount: existing.amount, vendorName: existing.vendorName, categoryName: existing.categoryName, costCenterName: existing.costCenterName };
      try {
        await notifySubmitterForApprovalRejectionFromExpense(updated.id, "rejected", tid, reason, req.requestId, expCtx);
      } catch (notifyErr) {
        logger.error("Failed to notify submitter for rejection", { requestId: req.requestId, err: String(notifyErr) });
      }
      res.json(updated);
    } catch (e) {
      logger.error("Expense reject error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  app.post("/api/admin/expenses/:id/payout", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.body?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { payoutMethod, payoutRef } = req.body;
      const whereClause = and(eq(expenses.id, req.params.id), eq(expenses.tenantId, tid));
      const [existing] = await db.select({ status: expenses.status, amount: expenses.amount, vendorName: expenses.vendorName, costCenterName: costCenters.name }).from(expenses).leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id)).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "approved") return res.status(400).json({ error: "Only approved expenses can be marked as paid" });
      const [updated] = await db.update(expenses).set({ status: "paid", payoutMethod: payoutMethod || null, payoutRef: payoutRef || null, payoutAt: new Date(), updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      const payCtx = { amount: existing.amount, vendorName: existing.vendorName, costCenterName: existing.costCenterName, payoutMethod, payoutRef };
      try {
        await notifySubmitterForPayoutFromExpense(updated.id, tid, req.requestId, payCtx);
      } catch (notifyErr) {
        logger.error("Failed to notify submitter for payout", { requestId: req.requestId, err: String(notifyErr) });
      }
      res.json(updated);
    } catch (e) {
      logger.error("Expense payout error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to record payout" });
    }
  });

  // Super Admin: Account-level settings (platform defaults)
  app.get("/api/admin/account-settings", requireSuperAdmin, async (req, res) => {
    try {
      const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
      if (!row) return res.json({ defaultNotificationEmails: null, defaultResendFromEmail: null, defaultSmsFrom: null });
      res.json({
        defaultNotificationEmails: row.defaultNotificationEmails,
        defaultResendFromEmail: row.defaultResendFromEmail,
        defaultSmsFrom: row.defaultSmsFrom,
      });
    } catch (e) {
      logger.error("Account settings get error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch account settings" });
    }
  });

  app.patch("/api/admin/account-settings", requireSuperAdmin, async (req, res) => {
    try {
      const { defaultNotificationEmails, defaultResendFromEmail, defaultSmsFrom } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (defaultNotificationEmails !== undefined) updates.defaultNotificationEmails = defaultNotificationEmails || null;
      if (defaultResendFromEmail !== undefined) updates.defaultResendFromEmail = defaultResendFromEmail || null;
      if (defaultSmsFrom !== undefined) updates.defaultSmsFrom = defaultSmsFrom || null;
      const [existing] = await db.select().from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
      let result;
      if (existing) {
        [result] = await db.update(platformSettings).set(updates as any).where(eq(platformSettings.id, "default")).returning();
      } else {
        [result] = await db.insert(platformSettings).values({ id: "default", ...updates } as any).returning();
      }
      res.json(result);
    } catch (e) {
      logger.error("Account settings update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update account settings" });
    }
  });

  // Super Admin: Tenants
  app.get("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const rows = await db.select().from(tenants).orderBy(tenants.name);
      res.json(rows);
    } catch (e) {
      logger.error("Tenants list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch tenants" });
    }
  });

  app.get("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ error: "Tenant not found" });
      res.json(row);
    } catch (e) {
      logger.error("Tenant get error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch tenant" });
    }
  });

  app.post("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const { name, slug } = req.body;
      if (!name || !slug) return res.status(400).json({ error: "name and slug required" });
      const slugNorm = slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!slugNorm) return res.status(400).json({ error: "Invalid slug" });
      const [created] = await db.insert(tenants).values({ name, slug: slugNorm, isActive: true }).returning();
      if (!created) return res.status(500).json({ error: "Failed to create tenant" });

      // Auto-seed MIS categories for the new tenant
      try {
        const seedResult = await seedMISCategoriesForTenant(created.id);
        logger.info("Auto-seeded MIS categories for new tenant", {
          requestId: req.requestId,
          tenantId: created.id,
          ...seedResult,
        });
      } catch (seedErr) {
        logger.error("Failed to auto-seed MIS categories (tenant still created)", {
          requestId: req.requestId,
          tenantId: created.id,
          err: String(seedErr),
        });
      }

      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Tenant slug already exists" });
      logger.error("Tenant create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create tenant" });
    }
  });

  app.post("/api/admin/tenants/:id/seed-mis", requireSuperAdmin, async (req, res) => {
    try {
      const tenantId = req.params.id;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const result = await seedMISCategoriesForTenant(tenantId);
      logger.info("Manually seeded MIS categories for tenant", {
        requestId: req.requestId,
        tenantId,
        ...result,
      });
      res.json({ success: true, tenantId, tenantName: tenant.name, ...result });
    } catch (e) {
      logger.error("Seed MIS error", { requestId: req.requestId, tenantId: req.params.id, err: String(e) });
      res.status(500).json({ error: "Failed to seed MIS categories" });
    }
  });

  app.patch("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const { name, slug, isActive } = req.body;
      const tenantId = req.params.id;
      const [existing] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Tenant not found" });
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) {
        const slugNorm = String(slug).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (!slugNorm) return res.status(400).json({ error: "Invalid slug" });
        updates.slug = slugNorm;
      }
      if (isActive !== undefined) updates.isActive = isActive;
      const [updated] = await db.update(tenants).set(updates as any).where(eq(tenants.id, tenantId)).returning();
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Tenant slug already exists" });
      logger.error("Tenant update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update tenant" });
    }
  });

  app.delete("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const tenantId = req.params.id;
      const [existing] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Tenant not found" });
      if (tenantId === "default") return res.status(400).json({ error: "Cannot delete default tenant" });
      await db.update(tenants).set({ isActive: false, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      res.status(204).send();
    } catch (e) {
      logger.error("Tenant delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete tenant" });
    }
  });

  app.get("/api/admin/tenants/:id/users", requireSuperAdmin, async (req, res) => {
    try {
      const tenantId = req.params.id;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      const creatorTable = aliasedTable(users, "creator");
      const updaterTable = aliasedTable(users, "updater");

      const rows = await db
        .select({ 
          id: users.id, 
          email: users.email, 
          name: users.name, 
          role: users.role, 
          isActive: users.isActive, 
          createdAt: users.createdAt,
          createdByName: creatorTable.name,
          updatedByName: updaterTable.name
        })
        .from(users)
        .leftJoin(creatorTable, eq(users.createdById, creatorTable.id))
        .leftJoin(updaterTable, eq(users.updatedById, updaterTable.id))
        .where(eq(users.tenantId, tenantId))
        .orderBy(users.name);
      res.json(rows);
    } catch (e) {
      logger.error("Tenant users list error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/tenants/:id/create-admin", requireSuperAdmin, async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ error: "email and password required" });
      const tenantId = req.params.id;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const [created] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash: await hashPassword(password),
          name: name || "Admin",
          role: "admin",
          tenantId,
          isActive: true,
          createdById: req.user?.id || null,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create admin" });
      const { passwordHash, ...u } = created;
      res.status(201).json(u);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Email already in use" });
      logger.error("Create tenant admin error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create admin" });
    }
  });

  app.patch("/api/admin/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { name, email, isActive, tenantId, password } = req.body;
      const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!existing) return res.status(404).json({ error: "User not found" });
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (isActive !== undefined) updates.isActive = isActive;
      if (tenantId !== undefined) updates.tenantId = tenantId || null;
      if (typeof password === "string" && password.trim()) {
        updates.passwordHash = await hashPassword(password);
      }
      updates.updatedById = req.user?.id || null;
      const [updated] = await db.update(users).set(updates as any).where(eq(users.id, userId)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { passwordHash, ...u } = updated;
      res.json(u);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Email already in use" });
      logger.error("User update error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  return server;
}
