import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import session from "express-session";
import MemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { db } from "./db.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { logger } from "./logger.js";

const PgSession = connectPgSimple(session);
const Store = MemoryStore(session);

async function canConnectToDb(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

export async function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || "finjoe-dev-secret-change-in-production";

  let sessionStore: session.Store;
  if (process.env.DATABASE_URL) {
    const dbReachable = await canConnectToDb(process.env.DATABASE_URL);
    if (dbReachable) {
      sessionStore = new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        tableName: "session",
        pruneSessionInterval: false, // Disable prune to avoid noisy errors when DB is unreachable
      });
    } else {
      logger.warn("Database unreachable at startup, using MemoryStore for sessions (sessions will not persist across restarts)");
      sessionStore = new Store({ checkPeriod: 86400000 });
    }
  } else {
    sessionStore = new Store({ checkPeriod: 86400000 });
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
      isActive: boolean;
    }
  }
}

export function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as Express.User;
  if (user.role !== "admin" && user.role !== "super_admin") return res.status(403).json({ message: "Forbidden" });
  next();
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
