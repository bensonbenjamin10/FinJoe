import express, { type Express } from "express";
import passport from "passport";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { db } from "./db.js";
import { hashPassword, requireAdmin, requireSuperAdmin, getTenantId } from "./auth.js";
import { logger } from "./logger.js";
import {
  tenants,
  tenantWabaProviders,
  costCenters,
  users,
  expenses,
  finJoeContacts,
  finJoeRoleChangeRequests,
  finjoeSettings,
  platformSettings,
  incomeCategories,
  incomeRecords,
} from "../shared/schema.js";
import { createFinJoeData } from "../lib/finjoe-data.js";

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
      const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
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
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const finJoeData = createFinJoeData(db, tenantId || "default");
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
      const tenantId = getTenantId(req);
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "super_admin" && !tenantId) return res.status(403).json({ error: "Tenant context required" });
      const { reason } = req.body;
      const finJoeData = createFinJoeData(db, tenantId || "default");
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
      const [deleted] = await db.delete(incomeCategories).where(whereClause).returning();
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (e) {
      logger.error("Income category delete error", { requestId: req.requestId, err: String(e) });
      res.status(500).json({ error: "Failed to delete" });
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
