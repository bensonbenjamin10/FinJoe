import express, { type Express } from "express";
import multer from "multer";
import passport from "passport";
import { eq, and, desc, or, sql, inArray, isNull } from "drizzle-orm";
import { db } from "./db.js";
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
  finJoeRoleChangeRequests,
  finjoeSettings,
  platformSettings,
  incomeCategories,
  incomeRecords,
  incomeTypes,
} from "../shared/schema.js";
import { createFinJoeData } from "../lib/finjoe-data.js";
import { createTemplatesInTwilio, submitTemplatesForApproval } from "../lib/twilio-content-create.js";
import { fetchApprovedTemplatesFromTwilio, fetchTemplateStatusesFromTwilio } from "../lib/twilio-content-sync.js";
import { sendFinJoeEmail } from "../worker/src/email.js";
import { sendFinJoeSms, sendFinJoeWhatsAppTemplate } from "../worker/src/twilio.js";
import { getCredentialsForTenant } from "../worker/src/providers/resolver.js";
import { getAnalytics, getPredictions } from "./analytics.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const EXPORT_ROW_LIMIT = parseInt(process.env.EXPORT_ROW_LIMIT ?? "10000", 10) || 10000;

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
      const rows = await db
        .select()
        .from(costCenters)
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
      const finJoeData = createFinJoeData(db, tenantId);
      const result = await finJoeData.approveRoleRequest(req.params.id, user.id, "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
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
      const finJoeData = createFinJoeData(db, tenantId);
      const result = await finJoeData.rejectRoleRequest(req.params.id, user.id, reason || "Rejected via admin", "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
      res.json({ id: result.id, rejected: true, reason: reason || "Rejected via admin" });
    } catch (e) {
      logger.error("FinJoe reject error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to reject" });
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
      const { expenseApprovalTemplateSid, expenseApprovedTemplateSid, expenseRejectedTemplateSid, reEngagementTemplateSid, notificationEmails, resendFromEmail, smsFrom, costCenterLabel, costCenterType } = req.body;
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
        templateSid = row ? (row as Record<string, string | null>)[field] : null;
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
      const tid = tenantId ?? req.body?.tenantId;
      const { name, slug, incomeType, displayOrder, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || slug;
      if (incomeType !== undefined) updates.incomeType = incomeType;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (isActive !== undefined) updates.isActive = isActive;
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
      const { campusId, costCenterId, categoryId, startDate, endDate } = req.query;
      const ccId = (costCenterId ?? campusId) as string | undefined;
      const conditions = [eq(incomeRecords.tenantId, tid)];
      if (ccId && ccId !== "all") {
        if (ccId === "null" || ccId === "__corporate__") conditions.push(sql`${incomeRecords.costCenterId} IS NULL`);
        else conditions.push(eq(incomeRecords.costCenterId, ccId));
      }
      if (categoryId && categoryId !== "all") conditions.push(eq(incomeRecords.categoryId, categoryId as string));
      if (startDate && typeof startDate === "string") conditions.push(sql`${incomeRecords.incomeDate} >= ${startDate}::date`);
      if (endDate && typeof endDate === "string") conditions.push(sql`${incomeRecords.incomeDate} <= ${endDate}::date`);
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
        })
        .from(incomeRecords)
        .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
        .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
        .where(and(...conditions))
        .orderBy(desc(incomeRecords.incomeDate), desc(incomeRecords.createdAt))
        .limit(200);
      const result = rows.map((r) => ({
        ...r,
        campusId: r.costCenterId,
        campusName: r.costCenterName,
      }));
      res.json(result);
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

  app.get("/api/admin/reconciliation", requireAdmin, async (req, res) => {
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
        return res.status(400).json({ error: "startDate and endDate must be valid ISO dates (YYYY-MM-DD)" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: "startDate must be before or equal to endDate" });
      }
      const incomeRows = await db
        .select({ amount: incomeRecords.amount })
        .from(incomeRecords)
        .where(
          and(
            eq(incomeRecords.tenantId, tid),
            sql`${incomeRecords.incomeDate} >= ${startDate}::date`,
            sql`${incomeRecords.incomeDate} <= ${endDate}::date`
          )
        );
      const expenseRows = await db
        .select({ amount: expenses.amount })
        .from(expenses)
        .where(
          and(
            eq(expenses.tenantId, tid),
            eq(expenses.status, "paid"),
            sql`${expenses.expenseDate} >= ${startDate}::date`,
            sql`${expenses.expenseDate} <= ${endDate}::date`
          )
        );
      const totalIncome = incomeRows.reduce((s, r) => s + (r.amount || 0), 0);
      const totalExpenses = expenseRows.reduce((s, r) => s + (r.amount || 0), 0);
      res.json({
        totalIncome,
        totalExpenses,
        bankNet: totalIncome - totalExpenses,
        incomeCount: incomeRows.length,
        expenseCount: expenseRows.length,
        unmappedIncomeCount: incomeRows.length,
        unmappedIncomeAmount: totalIncome,
      });
    } catch (e) {
      logger.error("Reconciliation error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch reconciliation" });
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

  app.get("/api/admin/analytics/predictions", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const parsed = req.query?.horizonDays ? parseInt(String(req.query.horizonDays), 10) : 30;
      const horizonDays = Math.min(90, Math.max(1, isNaN(parsed) ? 30 : parsed));
      const data = await getPredictions({ tenantId: tid, horizonDays });
      res.json(data);
    } catch (e) {
      logger.error("Predictions error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to fetch predictions" });
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
      const rows = await db
        .select()
        .from(expenseCategories)
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
      const tid = tenantId ?? req.body?.tenantId;
      const { name, slug, cashflowLabel, displayOrder, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = String(slug).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || slug;
      if (cashflowLabel !== undefined) updates.cashflowLabel = cashflowLabel;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (isActive !== undefined) updates.isActive = isActive;
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

      res.json({
        preview: expRows.map((r) => ({ date: r.date, particulars: r.particulars, amount: r.amount, majorHead: r.majorHead ?? "", branch: r.branch ?? "", categoryMatch: r.categoryMatch })),
        totalRows: expRows.length,
        totalAmount: totalExpAmount,
        incomePreview: incRows.map((r) => ({ date: r.date, particulars: r.particulars, amount: r.amount, categoryMatch: r.categoryMatch })),
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

      let imported = 0;
      let incomeImported = 0;

      const toDate = (dateStr: string): Date => {
        const d = new Date(dateStr + "T12:00:00Z");
        if (isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dateStr}`);
        return d;
      };

      for (let i = 0; i < expRows.length; i++) {
        const r = expRows[i];
        if (!isValidDateString(r.date)) continue;
        const overrideCat = expenseOverrides[String(i)];
        const categoryId = (overrideCat && validExpCatIds.has(overrideCat) ? overrideCat : null) ?? expSlugToId[r.categoryMatch] ?? expCats[0]?.id;
        if (!categoryId) continue;
        const overrideCc = costCenterOverrides[String(i)];
        const ccId = overrideCc !== undefined
          ? (overrideCc === null || overrideCc === "__corporate__" ? null : validCcIds.has(overrideCc) ? overrideCc : null)
          : branchToCcId(r.branch);
        await db.insert(expenses).values({
          tenantId: tid,
          costCenterId: ccId,
          categoryId,
          amount: r.amount,
          expenseDate: toDate(r.date),
          description: r.particulars || "Bank import",
          status: "draft",
          source: "bank_import",
        });
        imported++;
      }

      const defaultIncCatId = incCats[0]?.id;
      for (let i = 0; i < incRows.length; i++) {
        const r = incRows[i];
        if (!isValidDateString(r.date)) continue;
        const overrideCat = incomeOverrides[String(i)];
        const categoryId = (overrideCat && validIncCatIds.has(overrideCat) ? overrideCat : null) ?? incSlugToId[r.categoryMatch] ?? defaultIncCatId;
        if (!categoryId) continue;
        await db.insert(incomeRecords).values({
          tenantId: tid,
          costCenterId: null,
          categoryId,
          amount: r.amount,
          incomeDate: toDate(r.date),
          particulars: r.particulars || "Bank import",
          incomeType: "other",
          source: "bank_import",
        });
        incomeImported++;
      }

      res.json({ imported, incomeImported });
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
  app.get("/api/admin/expenses", requireAdmin, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const tid = tenantId ?? req.query?.tenantId;
      if (!tid || typeof tid !== "string") return res.status(400).json({ error: "tenantId required" });
      const { campusId, costCenterId, status, categoryId, source, startDate, endDate } = req.query;
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
          createdAt: expenses.createdAt,
          costCenterName: costCenters.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(...conditions))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(200);
      const result = rows.map((r) => ({
        ...r,
        campus: r.costCenterId ? { id: r.costCenterId, name: r.costCenterName, slug: "" } : null,
        costCenter: r.costCenterId ? { id: r.costCenterId, name: r.costCenterName, slug: "" } : null,
        category: r.categoryId ? { id: r.categoryId, name: r.categoryName, slug: "" } : null,
      }));
      res.json(result);
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
      const lines = [
        "Date,Cost Center,Category,Amount,Description,Particulars,Vendor,Invoice Number,Invoice Date,GSTIN,Tax Type,Voucher Number,Status,Payout Method,Payout Ref,Payout At",
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
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft expenses can be edited" });
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
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "pending_approval") return res.status(400).json({ error: "Only pending expenses can be approved" });
      const [updated] = await db.update(expenses).set({ status: "approved", approvedAt: new Date(), approvedById: (req.user as any).id, rejectionReason: null, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
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
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "pending_approval") return res.status(400).json({ error: "Only pending expenses can be rejected" });
      const [updated] = await db.update(expenses).set({ status: "rejected", rejectionReason: reason || null, updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
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
      const [existing] = await db.select({ status: expenses.status }).from(expenses).where(whereClause).limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.status !== "approved") return res.status(400).json({ error: "Only approved expenses can be marked as paid" });
      const [updated] = await db.update(expenses).set({ status: "paid", payoutMethod: payoutMethod || null, payoutRef: payoutRef || null, payoutAt: new Date(), updatedAt: new Date() }).where(whereClause).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
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
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Tenant slug already exists" });
      logger.error("Tenant create error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to create tenant" });
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
      const rows = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt })
        .from(users)
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
