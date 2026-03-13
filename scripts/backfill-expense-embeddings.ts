#!/usr/bin/env node
/**
 * Backfill expense embeddings for RAG/semantic search.
 * Processes expenses where embedding IS NULL, in batches.
 *
 * Usage: npx tsx scripts/backfill-expense-embeddings.ts
 * Requires: DATABASE_URL, GEMINI_API_KEY
 */

import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { embedExpenseText } from "../lib/expense-embeddings.js";

neonConfig.webSocketConstructor = ws;

const BATCH_SIZE = 15;
const DELAY_MS = 200;

const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  let total = 0;
  let processed = 0;
  let errors = 0;

  const countResult = await pool.query(
    "SELECT COUNT(*)::int as c FROM expenses WHERE embedding IS NULL"
  );
  total = countResult.rows[0]?.c ?? 0;

  if (total === 0) {
    console.log("No expenses need embedding. Done.");
    await pool.end();
    return;
  }

  console.log(`Found ${total} expenses without embeddings. Processing in batches of ${BATCH_SIZE}...`);

  while (true) {
    const batch = await pool.query(
      `SELECT e.id, e.tenant_id, e.vendor_name, e.description, e.particulars, e.amount, e.invoice_number, ec.name as category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.embedding IS NULL
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      try {
        const embedding = await embedExpenseText({
          vendorName: row.vendor_name,
          description: row.description,
          particulars: row.particulars,
          categoryName: row.category_name,
          amount: row.amount,
          invoiceNumber: row.invoice_number,
        });

        if (embedding) {
          const vectorStr = "[" + embedding.join(",") + "]";
          await pool.query(
            "UPDATE expenses SET embedding = $1::vector WHERE id = $2 AND tenant_id = $3",
            [vectorStr, row.id, row.tenant_id]
          );
          processed++;
        }
      } catch (err) {
        console.error(`  Error expense ${row.id}:`, (err as Error).message);
        errors++;
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    console.log(`  Processed ${processed}/${total} (${errors} errors)`);
  }

  console.log(`Done. Embedded ${processed} expenses, ${errors} errors.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
