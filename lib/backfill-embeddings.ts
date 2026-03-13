/**
 * Backfill expense embeddings for RAG/semantic search.
 * Processes expenses where embedding IS NULL, in batches.
 * Used by worker cron endpoint and startup, and by scripts/backfill-expense-embeddings.ts.
 */

import { embedExpenseText } from "./expense-embeddings.js";

export type BackfillPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const BATCH_SIZE = 15;
const DELAY_MS = 200;

export interface BackfillResult {
  processed: number;
  errors: number;
  total: number;
  skipped: boolean; // true if no GEMINI_API_KEY or no expenses to process
}

/**
 * Run embeddings backfill. Processes expenses where embedding IS NULL.
 * Returns early if GEMINI_API_KEY is not set.
 */
export async function runBackfillEmbeddings(pool: BackfillPool): Promise<BackfillResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { processed: 0, errors: 0, total: 0, skipped: true };
  }

  const countResult = await pool.query(
    "SELECT COUNT(*)::int as c FROM expenses WHERE embedding IS NULL"
  );
  const total = (countResult.rows[0]?.c as number) ?? 0;

  if (total === 0) {
    return { processed: 0, errors: 0, total: 0, skipped: false };
  }

  let processed = 0;
  let errors = 0;

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
          vendorName: row.vendor_name as string | null,
          description: row.description as string | null,
          particulars: row.particulars as string | null,
          categoryName: row.category_name as string | null,
          amount: row.amount as number,
          invoiceNumber: row.invoice_number as string | null,
        });

        if (embedding) {
          const vectorStr = "[" + embedding.join(",") + "]";
          await pool.query(
            "UPDATE expenses SET embedding = $1::vector WHERE id = $2 AND tenant_id = $3",
            [vectorStr, row.id, row.tenant_id]
          );
          processed++;
        } else {
          errors++; // API failed or returned empty; expense stays NULL for retry
        }
      } catch (err) {
        errors++;
        // Log but continue - don't throw
        console.error(`  Error expense ${row.id}:`, (err as Error).message);
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return { processed, errors, total, skipped: false };
}
