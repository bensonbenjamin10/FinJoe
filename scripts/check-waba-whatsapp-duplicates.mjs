#!/usr/bin/env node
/**
 * Report duplicate whatsapp_from values in tenant_waba_providers.
 * The partial unique index (migration 0015) blocks duplicate *active* senders;
 * this script finds existing bad data before migration or any inactive duplicates.
 *
 * Usage:
 *   node scripts/check-waba-whatsapp-duplicates.mjs
 *   npm run db:check-waba-duplicates
 *
 * Requires: DATABASE_URL (e.g. from .env)
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function normalizeConnectionString(url) {
  if (!url || typeof url !== "string") return url;
  const needsNoSsl =
    (url.includes(".railway.internal") || url.includes(".proxy.rlwy.net")) &&
    !url.includes("sslmode=");
  if (needsNoSsl) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "sslmode=disable";
  }
  return url;
}

const DATABASE_URL = normalizeConnectionString(process.env.DATABASE_URL);
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (e.g. in .env)");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
});

const summaryActive = `
  SELECT whatsapp_from, COUNT(*)::int AS row_count
  FROM tenant_waba_providers
  WHERE is_active = true
  GROUP BY whatsapp_from
  HAVING COUNT(*) > 1
  ORDER BY row_count DESC, whatsapp_from
`;

const detailActive = `
  SELECT
    w.id,
    w.tenant_id,
    t.name AS tenant_name,
    w.whatsapp_from,
    w.is_active,
    w.provider,
    w.created_at
  FROM tenant_waba_providers w
  LEFT JOIN tenants t ON t.id = w.tenant_id
  WHERE w.is_active = true
    AND w.whatsapp_from IN (
      SELECT whatsapp_from
      FROM tenant_waba_providers
      WHERE is_active = true
      GROUP BY whatsapp_from
      HAVING COUNT(*) > 1
    )
  ORDER BY w.whatsapp_from, w.created_at DESC
`;

const summaryAll = `
  SELECT whatsapp_from, COUNT(*)::int AS row_count
  FROM tenant_waba_providers
  GROUP BY whatsapp_from
  HAVING COUNT(*) > 1
  ORDER BY row_count DESC, whatsapp_from
`;

try {
  console.log("=== Duplicate whatsapp_from (is_active = true only) ===\n");
  const dupActive = await pool.query(summaryActive);
  if (dupActive.rows.length === 0) {
    console.log("No duplicates among active rows. OK.\n");
  } else {
    console.log(`Found ${dupActive.rows.length} whatsapp_from value(s) with multiple active rows:\n`);
    console.table(dupActive.rows);
    const detail = await pool.query(detailActive);
    console.log("\nDetail (active rows only):\n");
    console.table(detail.rows);
  }

  console.log("\n=== Duplicate whatsapp_from (all rows, including inactive) ===\n");
  const dupAll = await pool.query(summaryAll);
  if (dupAll.rows.length === 0) {
    console.log("No duplicates in the table at all.\n");
  } else {
    if (dupActive.rows.length === 0) {
      console.log(
        "Note: same whatsapp_from appears on multiple rows only when inactive rows are included; active set is clean.\n"
      );
    }
    console.table(dupAll.rows);
  }

  process.exit(dupActive.rows.length > 0 ? 2 : 0);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
