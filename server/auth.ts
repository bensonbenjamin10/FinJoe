import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { parse as parseCookies } from "cookie";
import session from "express-session";
import MemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { db, pool } from "./db.js";
import { logger } from "./logger.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";

const PgSession = connectPgSimple(session);
const Store = MemoryStore(session);

/** Test DB reachability; if unreachable, fall back to MemoryStore so app can serve. */
async function getSessionStore(): Promise<session.Store> {
  if (!process.env.DATABASE_URL) {
    return new Store({ checkPeriod: 86400000 });
  }
  try {
    const client = await pool.connect();
    client.release();
    return new PgSession({
      pool,
      createTableIfMissing: true,
      tableName: "session",
      pruneSessionInterval: false,
    });
  } catch (err) {
    logger.warn("Database unreachable at startup, using MemoryStore for sessions", { err: String(err) });
    return new Store({ checkPeriod: 86400000 });
  }
}

const isProduction = process.env.NODE_ENV === "production";

export async function setupAuth(app: Express) {
  if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production (sessions cannot use a default secret).");
  }
  const sessionSecret = process.env.SESSION_SECRET || "finjoe-dev-secret-change-in-production";
  const sessionStore = await getSessionStore();
  if (sessionStore instanceof Store) {
    logger.warn(
      "Using MemoryStore for sessions: not shared across multiple server instances and cleared on restart. Use a reachable DATABASE_URL and connect-pg-simple for production horizontal scale.",
    );
  }

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);

          if (!user) return done(null, false, { message: "Invalid email or password" });
          if (!user.isActive) return done(null, false, { message: "Account is inactive" });

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return done(null, false, { message: "Invalid email or password" });

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      role: string;
      tenantId?: string | null;
      campusId?: string | null;
      costCenterId?: string | null;
      realTenantId?: string | null;
      salesAssistanceRequested?: boolean;
      isActive: boolean;
    }
  }
}

/** Tenant dashboard roles (excludes super_admin, which bypasses all checks below). */
export const TENANT_STAFF_ROLES = ["admin", "finance", "campus_coordinator", "head_office"] as const;

/** Approve/reject expenses, payouts, role requests, bulk import execute. */
export const APPROVER_ROLES = ["admin", "finance"] as const;

function roleAllowed(user: Express.User, allowed: readonly string[]): boolean {
  if (user.role === "super_admin") return true;
  return allowed.includes(user.role);
}

/** Factory: authenticated user must have one of `allowed` roles, or be super_admin. */
export function requireAnyRole(allowed: readonly string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as Express.User;
    if (!roleAllowed(user, allowed)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

/** Tenant org admin or super_admin — contacts, cost center CRUD, settings, category seeds, etc. */
export const requireTenantAdmin = requireAnyRole(["admin"]);

/** Any staff role that may use the dashboard for operational data. */
export const requireTenantStaff = requireAnyRole(TENANT_STAFF_ROLES);

/** Admin or finance — approvals, import execute, payouts. */
export const requireApprover = requireAnyRole(APPROVER_ROLES);

/** @alias requireTenantAdmin */
export function requireAdmin(req: any, res: any, next: any) {
  return requireTenantAdmin(req, res, next);
}

export function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as Express.User;
  if (user.role !== "super_admin") return res.status(403).json({ message: "Super admin only" });
  next();
}

/**
 * Returns tenantId for the request: from session (user.tenantId), or from query when super_admin impersonates.
 *
 * IMPORTANT for super_admin: getTenantId only reads req.query?.tenantId, NOT req.body.
 * For POST/PATCH routes where super_admin must specify tenant context, the route must
 * explicitly fall back to req.body?.tenantId or req.query?.tenantId, e.g.:
 *   const tenantId = getTenantId(req) ?? req.body?.tenantId ?? req.query?.tenantId;
 * Otherwise super_admin requests without ?tenantId= in the URL will get null.
 */
export function getTenantId(req: any): string | null {
  const user = req.user as Express.User;
  if (!user) return null;
  if (user.role === "super_admin") {
    const q = req.query?.tenantId;
    return typeof q === "string" ? q : null;
  }
  return user.tenantId ?? null;
}

// ── Shareable dashboard session (PIN-gated, no user account required) ──

const DASHBOARD_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const DASHBOARD_COOKIE_NAME = "fj_dashboard";

function getDashboardSecret(): string {
  return process.env.SESSION_SECRET || "finjoe-dev-secret-change-in-production";
}

/**
 * Token format: "<tenantId>.<exp>.<sig>"
 *
 * Dots are used as separators (not colons) because encodeURIComponent() does NOT
 * encode dots, whereas it encodes colons as %3A. Using dots means the token
 * survives res.cookie() → Set-Cookie → Cookie header round-trip without any
 * encoding surprises, and no decoding step is needed on the read side.
 *
 * tenantId: UUID (hex + hyphens — no dots)
 * exp:      millisecond timestamp (digits only — no dots)
 * sig:      HMAC-SHA256 hex (hex chars only — no dots)
 */
function signDashboardToken(tenantId: string, exp: number): string {
  const payload = `${tenantId}.${exp}`;
  const sig = crypto.createHmac("sha256", getDashboardSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyDashboardToken(rawToken: string): { tenantId: string } | null {
  // Use cookie.parse() for reads, so the token is already decoded. Split on dots.
  const parts = rawToken.split(".");
  // Expected: ["<tenantId-part1>", ..., "<exp>", "<sig>"]
  // tenantId is a UUID with 5 hyphen-separated groups: 8-4-4-4-12 hex chars = no dots
  // So we always have exactly 3 dot-separated segments
  if (parts.length !== 3) return null;
  const [tenantId, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!tenantId || isNaN(exp) || Date.now() > exp) return null;
  const payload = `${tenantId}.${exp}`;
  const expected = crypto.createHmac("sha256", getDashboardSecret()).update(payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return { tenantId };
}

export function createDashboardSessionCookie(res: Response, tenantId: string): void {
  const exp = Date.now() + DASHBOARD_SESSION_TTL_MS;
  const token = signDashboardToken(tenantId, exp);
  // encode: String disables Express's default encodeURIComponent so the token
  // is stored exactly as-is. The token only contains UUID chars, digits, hex,
  // and dots — all valid cookie octets per RFC 6265 — so no encoding is needed.
  (res as any).cookie(DASHBOARD_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DASHBOARD_SESSION_TTL_MS,
    encode: String,
  });
}

export function requireDashboardSession(req: Request, res: Response, next: NextFunction): void {
  // cookie.parse() handles decoding (decodeURIComponent) automatically — the
  // correct way to read cookies from the raw Cookie header.
  const cookies = parseCookies(req.headers.cookie ?? "");
  const token = cookies[DASHBOARD_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Dashboard session required" });
    return;
  }
  const parsed = verifyDashboardToken(token);
  if (!parsed) {
    res.clearCookie(DASHBOARD_COOKIE_NAME);
    res.status(401).json({ error: "Dashboard session expired or invalid" });
    return;
  }
  (req as any).dashboardTenantId = parsed.tenantId;
  next();
}
