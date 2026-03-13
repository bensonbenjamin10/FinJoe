/**
 * Backfill expense embeddings for RAG/semantic search.
 * Processes expenses where embedding IS NULL, in batches.
 * Used by worker cron endpoint and startup, and by scripts/backfill-expense-embeddings.ts.
 */

import { embedExpenseText } from "./expense-embeddings.js";

export type BackfillPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>;
};

const BATCH_SIZE = 15;

/** Normalize query result: node-pg returns { rows }, some drivers return array directly. */
function getRows<T = Record<string, unknown>>(result: { rows?: T[] } | T[]): T[] {
  if (Array.isArray(result)) return result;
  return result.rows ?? [];
}

function getFirstRow<T = Record<string, unknown>>(result: { rows?: T[] } | T[]): T | undefined {
  const rows = getRows(result);
  return rows[0];
}

const DELAY_MS = 200;
/** Max expenses to process per run (cron/startup). Prevents HTTP timeout. Use env for larger manual runs. */
const DEFAULT_MAX_PER_RUN = 500;

export interface BackfillResult {
  processed: number;
  errors: number;
  total: number;
  skipped: boolean; // true if no GEMINI_API_KEY or no expenses to process
  remaining?: number; // approximate count still left (when limited by maxPerRun)
}

export interface BackfillOptions {
  /** Max expenses to process this run. Default from BACKFILL_EMBEDDINGS_MAX_PER_RUN env or 500. */
  maxPerRun?: number;
}

/**
 * Run embeddings backfill. Processes expenses where embedding IS NULL.
 * Returns early if GEMINI_API_KEY is not set.
 * Respects maxPerRun to avoid timeout on large backfills (cron/startup).
 */
export async function runBackfillEmbeddings(
  pool: BackfillPool,
  options?: BackfillOptions
): Promise<BackfillResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { processed: 0, errors: 0, total: 0, skipped: true };
  }

  const maxPerRun =
    options?.maxPerRun ??
    (parseInt(process.env.BACKFILL_EMBEDDINGS_MAX_PER_RUN || "", 10) || DEFAULT_MAX_PER_RUN);
  const limit = maxPerRun === 0 ? Infinity : maxPerRun;

  const countResult = await pool.query(
    "SELECT COUNT(*)::int as c FROM expenses WHERE embedding IS NULL"
  );
  const firstRow = getFirstRow(countResult);
  const total = (firstRow?.c as number) ?? 0;

  if (total === 0) {
    return { processed: 0, errors: 0, total: 0, skipped: false };
  }

  let processed = 0;
  let errors = 0;

  while (processed + errors < limit) {
    const batchResult = await pool.query(
      `SELECT e.id, e.tenant_id, e.vendor_name, e.description, e.particulars, e.amount, e.invoice_number, ec.name as category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.embedding IS NULL
       LIMIT $1`,
      [Math.min(BATCH_SIZE, limit === Infinity ? BATCH_SIZE : limit - processed - errors)]
    );

    const batchRows = getRows(batchResult);
    if (batchRows.length === 0) break;

    for (const row of batchRows) {
      if (processed + errors >= limit) break;
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

  // Count how many still need embedding (for incremental runs)
  let remaining: number | undefined;
  if (processed + errors > 0) {
    const remResult = await pool.query(
      "SELECT COUNT(*)::int as c FROM expenses WHERE embedding IS NULL"
    );
    const remRow = getFirstRow(remResult);
    remaining = (remRow?.c as number) ?? 0;
  }
  return {
    processed,
    errors,
    total,
    skipped: false,
    ...(remaining !== undefined && remaining > 0 && { remaining }),
  };
}
