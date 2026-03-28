/**
 * Vendor master records (AP) — normalized names for accounting integrations.
 */

import { eq, and, sql } from "drizzle-orm";
import { vendors } from "../shared/schema.js";

/** Drizzle DB handle (avoid circular import from finjoe-data). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbHandle = any;

/** URL-safe slug from display name (lowercase, hyphenated). */
export function slugifyVendorName(name: string): string {
  const t = name.trim().toLowerCase();
  const s = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "vendor";
}

/**
 * Find or create a vendor for the tenant. Matches existing row by normalized name (case-insensitive).
 * When gstin is provided and differs from existing, updates the vendor row.
 */
export async function findOrCreateVendorByName(
  db: DbHandle,
  tenantId: string,
  name: string | null | undefined,
  gstin?: string | null,
): Promise<string | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  const [existing] = await db
    .select({ id: vendors.id, gstin: vendors.gstin })
    .from(vendors)
    .where(
      and(
        eq(vendors.tenantId, tenantId),
        eq(vendors.isActive, true),
        sql`lower(trim(${vendors.name})) = ${normalized}`,
      ),
    )
    .limit(1);

  if (existing) {
    const g = gstin?.trim().toUpperCase() || null;
    if (g && g !== (existing.gstin ?? "")) {
      await db
        .update(vendors)
        .set({ gstin: g, updatedAt: new Date() })
        .where(eq(vendors.id, existing.id));
    }
    return existing.id;
  }

  let baseSlug = slugifyVendorName(trimmed);
  let slug = baseSlug;
  for (let n = 0; n < 20; n++) {
    const [collision] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.slug, slug)))
      .limit(1);
    if (!collision) break;
    slug = `${baseSlug}-${n + 2}`;
  }

  const [created] = await db
    .insert(vendors)
    .values({
      tenantId,
      name: trimmed,
      slug,
      gstin: gstin?.trim().toUpperCase() || null,
    })
    .returning({ id: vendors.id });

  return created?.id ?? null;
}
