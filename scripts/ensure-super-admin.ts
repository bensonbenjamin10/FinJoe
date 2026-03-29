#!/usr/bin/env npx tsx
/**
 * Create or upgrade a user to platform super_admin (tenantId null, bcrypt password).
 *
 * Usage (recommended — avoids shell history for password):
 *   set SUPER_ADMIN_EMAIL=you@domain.com
 *   set SUPER_ADMIN_PASSWORD=your-secret
 *   npx tsx scripts/ensure-super-admin.ts
 *
 * Requires DATABASE_URL (same as the app).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db.js";
import { users } from "../shared/schema.js";
import { hashPassword } from "../server/auth.js";

async function main() {
  const emailRaw = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!emailRaw || !password) {
    console.error(
      "Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (environment variables). DATABASE_URL must be set.",
    );
    process.exit(1);
  }
  const email = emailRaw.toLowerCase();
  const passwordHash = await hashPassword(password);

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "super_admin",
        tenantId: null,
        realTenantId: null,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated user to super_admin: ${email} (id=${existing.id})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: email.split("@")[0] || "Super Admin",
        role: "super_admin",
        tenantId: null,
        isActive: true,
      })
      .returning({ id: users.id });
    console.log(`Created super_admin: ${email} (id=${created?.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
