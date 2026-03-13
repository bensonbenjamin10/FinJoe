# Bug & Gap Review

## Bugs to Fix

### 1. Backfill: embedExpenseText returns null not counted as error
**Location:** `lib/backfill-embeddings.ts`

When `embedExpenseText` returns `null` (API failure, rate limit, empty text), we skip the expense but don't increment `errors`. The expense stays with `embedding IS NULL` and will be retried next run, but we undercount failures.

**Fix:** Increment `errors` when `embedding` is null but we attempted to process:

```ts
if (embedding) {
  // ... update
  processed++;
} else {
  errors++; // API failed or returned empty
}
```

### 2. run-all-cron: 200 with non-JSON body reported as success
**Location:** `scripts/run-all-cron.mjs`

When the worker returns 200 with a non-JSON body (e.g. HTML error page, proxy error), we do:
`data = { error: await res.text() }`. Then `res.ok` is true, so we go to the success branch. We log "Backfill embeddings OK (none needed)" because `data.processed` is undefined. We incorrectly report success.

**Fix:** Treat `res.ok && data.error` as failure:

```js
if (!res.ok || data.error) {
  console.error("... error:", data.error || res.statusText);
  hadError = true;
} else {
  // success
}
```

---

## Gaps (Lower Priority)

### Backfill & embeddings
| Gap | Impact | Mitigation |
|-----|--------|------------|
| Large backfill can timeout | Cron HTTP request may time out with 10k+ expenses | Run initial backfill manually: `npm run backfill:embeddings`. Cron/startup handles incremental. |
| No per-run limit | Single run processes all NULL embeddings | Acceptable; skip when complete. For very large DBs, consider adding `LIMIT` per run. |
| embedExpenseText null not logged | Silent API failures | Fix #1 above. |

### Cron
| Gap | Impact | Mitigation |
|-----|--------|------------|
| FINJOE_WORKER_URL must be reachable | Cron service calls worker over HTTP | Set to worker's public URL (e.g. Railway domain). Cron and worker must be on same network or public. |
| Non-JSON 200 response | Wrong success reporting | Fix #2 above. |

### Recurring expenses (from RECURRING_EXPENSES_REVIEW.md)
| Gap | Impact |
|-----|--------|
| Category/cost center deleted | FK violation on expense create |
| Timezone | All dates UTC; no tenant-specific TZ |
| Catch-up for missed runs | One run per template per cron; no backfill of missed days |

### Migration 021
| Gap | Impact |
|-----|--------|
| CREATE EXTENSION vector | Requires superuser on some Postgres. Neon supports it. |

---

## Already Handled

- **Backfill skip when complete** – Counts `WHERE embedding IS NULL`; returns early if 0.
- **Duplicate recurring expenses** – Check before create; advance nextRunDate if exists.
- **updateRecurringTemplate nextRunDate** – Only recompute when schedule fields change.
- **Date formats** – parseDateToISO supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
- **searchExpensesByEmbedding** – try/catch returns [] on failure (e.g. column missing).
- **Concurrent backfill** – Both processes UPDATE same row; last write wins; no duplicates.
- **run-all-cron content-type** – Uses `contentType.includes("application/json")` before `res.json()`.
