#!/usr/bin/env node
/**
 * Backfill vendors from expenses.recurring vendor_name and link vendor_id.
 * Run after migration 0011_vendors_expense_tax. Idempotent.
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function normalizeConnectionString(url) {
  if (!url || typeof url !== "string") return url;
  const needsNoSsl =
    (url.includes(".railway.internal") || url.includes(".proxy.rlwy.net")) && !url.includes("sslmode=");
  if (needsNoSsl) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "sslmode=disable";
  }
  return url;
}

function slugify(name) {
  const t = String(name).trim().toLowerCase();
  const s = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "vendor";
}

async function ensureVendor(pool, tenantId, name, gstin) {
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const { rows: found } = await pool.query(
    `SELECT id FROM vendors WHERE tenant_id = $1 AND lower(trim(name)) = lower($2) LIMIT 1`,
    [tenantId, trimmed],
  );
  if (found.length) {
    const id = found[0].id;
    if (gstin && String(gstin).trim()) {
      await pool.query(`UPDATE vendors SET gstin = $2, updated_at = now() WHERE id = $1 AND (gstin IS NULL OR gstin = '')`, [
        id,
        String(gstin).trim().toUpperCase(),
      ]);
    }
    return id;
  }
  let base = slugify(trimmed);
  let slug = base;
  for (let n = 0; n < 25; n++) {
    const { rows: col } = await pool.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND slug = $2 LIMIT 1`, [
      tenantId,
      slug,
    ]);
    if (!col.length) break;
    slug = `${base}-${n + 2}`;
  }
  const { rows: ins } = await pool.query(
    `INSERT INTO vendors (tenant_id, name, slug, gstin, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, now(), now())
     RETURNING id`,
    [tenantId, trimmed, slug, gstin ? String(gstin).trim().toUpperCase() : null],
  );
  return ins[0]?.id ?? null;
}

async function main() {
  const url = normalizeConnectionString(process.env.DATABASE_URL);
  if (!url) {
    console.error("DATABASE_URL must be set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const { rows: expensePairs } = await pool.query(`
      SELECT DISTINCT tenant_id, trim(vendor_name) AS vname
      FROM expenses
      WHERE vendor_name IS NOT NULL AND trim(vendor_name) <> '' AND vendor_id IS NULL
    `);
    let linkedExp = 0;
    for (const r of expensePairs) {
      const { rows: gstRows } = await pool.query(
        `SELECT gstin FROM expenses WHERE tenant_id = $1 AND trim(vendor_name) = $2 AND gstin IS NOT NULL AND trim(gstin) <> '' LIMIT 1`,
        [r.tenant_id, r.vname],
      );
      const gstin = gstRows[0]?.gstin ?? null;
      const vid = await ensureVendor(pool, r.tenant_id, r.vname, gstin);
      if (!vid) continue;
      const up = await pool.query(
        `UPDATE expenses SET vendor_id = $1 WHERE tenant_id = $2 AND trim(vendor_name) = $3 AND vendor_id IS NULL`,
        [vid, r.tenant_id, r.vname],
      );
      linkedExp += up.rowCount ?? 0;
    }
    console.log(`Linked ${linkedExp} expense rows to vendors.`);

    const { rows: tplPairs } = await pool.query(`
      SELECT DISTINCT tenant_id, trim(vendor_name) AS vname
      FROM recurring_expense_templates
      WHERE vendor_name IS NOT NULL AND trim(vendor_name) <> '' AND vendor_id IS NULL
    `);
    let linkedTpl = 0;
    for (const r of tplPairs) {
      const { rows: gstRows } = await pool.query(
        `SELECT gstin FROM recurring_expense_templates WHERE tenant_id = $1 AND trim(vendor_name) = $2 AND gstin IS NOT NULL AND trim(gstin) <> '' LIMIT 1`,
        [r.tenant_id, r.vname],
      );
      const gstin = gstRows[0]?.gstin ?? null;
      const vid = await ensureVendor(pool, r.tenant_id, r.vname, gstin);
      if (!vid) continue;
      const up = await pool.query(
        `UPDATE recurring_expense_templates SET vendor_id = $1 WHERE tenant_id = $2 AND trim(vendor_name) = $3 AND vendor_id IS NULL`,
        [vid, r.tenant_id, r.vname],
      );
      linkedTpl += up.rowCount ?? 0;
    }
    console.log(`Linked ${linkedTpl} recurring template rows to vendors.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
