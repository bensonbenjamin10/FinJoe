import express, { type Express } from "express";
import passport from "passport";
import { eq, and, desc } from "drizzle-orm";
import { db } from "./db.js";
import { hashPassword } from "./auth.js";
import { requireAdmin } from "./auth.js";
import {
  campuses,
  users,
  finJoeContacts,
  finJoeRoleChangeRequests,
} from "../shared/schema.js";
import { createFinJoeData } from "../lib/finjoe-data.js";

export async function registerRoutes(app: Express) {
  const http = await import("http");
  const server = http.createServer(app);

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ error: "Authentication error" });
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ error: "Login failed" });
        const { passwordHash, ...u } = user;
        res.json(u);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ message: "Logged out" }));
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
      const [created] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash: await hashPassword(password),
          name: name || "Admin",
          role: "admin",
          isActive: true,
        })
        .returning();
      if (!created) return res.status(500).json({ error: "Failed to create admin" });
      const { passwordHash, ...u } = created;
      res.status(201).json(u);
    } catch (e) {
      console.error("Setup error:", e);
      res.status(500).json({ error: "Setup failed" });
    }
  });

  app.get("/api/campuses", async (_req, res) => {
    try {
      const rows = await db.select().from(campuses).where(eq(campuses.isActive, true)).orderBy(campuses.name);
      res.json(rows);
    } catch (e) {
      console.error("Campuses error:", e);
      res.status(500).json({ error: "Failed to fetch campuses" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(users.name);
      res.json(rows);
    } catch (e) {
      console.error("Admin users error:", e);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/finjoe/contacts", requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(finJoeContacts).orderBy(finJoeContacts.createdAt);
      res.json(rows);
    } catch (e) {
      console.error("FinJoe contacts error:", e);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.post("/api/admin/finjoe/contacts", requireAdmin, async (req, res) => {
    try {
      const { phone, role, name, campusId, studentId } = req.body;
      if (!phone || !role) return res.status(400).json({ error: "phone and role required" });
      const digits = phone.replace(/\D/g, "");
      const normalized = digits.length === 10 ? `91${digits}` : digits.startsWith("91") ? digits : `91${digits}`;
      const validRoles = ["campus_coordinator", "head_office", "finance", "admin", "vendor", "faculty", "student", "guest"];
      if (!validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });

      let resolvedUserId = studentId || null;
      if ((role === "admin" || role === "finance") && !resolvedUserId) {
        const finjoeEmail = `finjoe-${normalized}@finjoe.internal`;
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, finjoeEmail)).limit(1);
        if (existing) resolvedUserId = existing.id;
        else {
          const [newUser] = await db
            .insert(users)
            .values({
              email: finjoeEmail,
              passwordHash: await hashPassword(crypto.randomUUID()),
              name: name || "FinJoe Admin",
              role,
              campusId: campusId || null,
              isActive: true,
            })
            .returning({ id: users.id });
          if (newUser) resolvedUserId = newUser.id;
        }
      }

      const [created] = await db
        .insert(finJoeContacts)
        .values({
          phone: normalized.length > 10 ? normalized : `91${normalized}`,
          role,
          name: name || null,
          campusId: campusId || null,
          studentId: resolvedUserId,
          isActive: true,
        })
        .returning();
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Contact with this phone already exists" });
      console.error("FinJoe contact create error:", e);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.patch("/api/admin/finjoe/contacts/:id", requireAdmin, async (req, res) => {
    try {
      const { role, name, campusId, studentId, isActive } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (role !== undefined) updates.role = role;
      if (name !== undefined) updates.name = name;
      if (campusId !== undefined) updates.campusId = campusId;
      if (studentId !== undefined) updates.studentId = studentId;
      if (isActive !== undefined) updates.isActive = isActive;

      const [existing] = await db.select().from(finJoeContacts).where(eq(finJoeContacts.id, req.params.id)).limit(1);
      const targetRole = role ?? existing?.role;
      const needsUser = (targetRole === "admin" || targetRole === "finance") && studentId === undefined && existing && !existing.studentId;
      if (needsUser && existing) {
        const finjoeEmail = `finjoe-${existing.phone}@finjoe.internal`;
        const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, finjoeEmail)).limit(1);
        if (ex) updates.studentId = ex.id;
        else {
          const [nu] = await db
            .insert(users)
            .values({
              email: finjoeEmail,
              passwordHash: await hashPassword(crypto.randomUUID()),
              name: (name ?? existing.name) || "FinJoe Admin",
              role: targetRole,
              campusId: campusId ?? existing.campusId,
              isActive: true,
            })
            .returning({ id: users.id });
          if (nu) updates.studentId = nu.id;
        }
      }

      const [updated] = await db.update(finJoeContacts).set(updates as any).where(eq(finJoeContacts.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Contact not found" });
      res.json(updated);
    } catch (e) {
      console.error("FinJoe contact update error:", e);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.delete("/api/admin/finjoe/contacts/:id", requireAdmin, async (req, res) => {
    try {
      const [deleted] = await db.delete(finJoeContacts).where(eq(finJoeContacts.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Contact not found" });
      res.status(204).send();
    } catch (e) {
      console.error("FinJoe contact delete error:", e);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  app.get("/api/admin/finjoe/role-requests", requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const conditions = status && typeof status === "string" && status !== "all" ? [eq(finJoeRoleChangeRequests.status, status)] : [];
      let query = db
        .select({
          id: finJoeRoleChangeRequests.id,
          contactPhone: finJoeRoleChangeRequests.contactPhone,
          requestedRole: finJoeRoleChangeRequests.requestedRole,
          name: finJoeRoleChangeRequests.name,
          status: finJoeRoleChangeRequests.status,
          campusId: finJoeRoleChangeRequests.campusId,
          createdAt: finJoeRoleChangeRequests.createdAt,
          campusName: campuses.name,
        })
        .from(finJoeRoleChangeRequests)
        .leftJoin(campuses, eq(finJoeRoleChangeRequests.campusId, campuses.id))
        .orderBy(desc(finJoeRoleChangeRequests.createdAt))
        .limit(50)
        .$dynamic();
      if (conditions.length > 0) query = query.where(and(...conditions));
      const rows = await query;
      res.json(rows);
    } catch (e) {
      console.error("FinJoe role requests error:", e);
      res.status(500).json({ error: "Failed to fetch role requests" });
    }
  });

  app.post("/api/admin/finjoe/role-requests/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      const finJoeData = createFinJoeData(db);
      const result = await finJoeData.approveRoleRequest(req.params.id, user.id, "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
      res.json({ id: result.id, approved: true });
    } catch (e) {
      console.error("FinJoe approve error:", e);
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  app.post("/api/admin/finjoe/role-requests/:id/reject", requireAdmin, async (req, res) => {
    try {
      const user = req.user as Express.User;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
      const { reason } = req.body;
      const finJoeData = createFinJoeData(db);
      const result = await finJoeData.rejectRoleRequest(req.params.id, user.id, reason || "Rejected via admin", "admin");
      if (!result) return res.status(404).json({ error: "Role request not found or not pending" });
      res.json({ id: result.id, rejected: true, reason: reason || "Rejected via admin" });
    } catch (e) {
      console.error("FinJoe reject error:", e);
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  return server;
}
