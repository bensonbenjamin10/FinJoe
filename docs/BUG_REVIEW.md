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

## Gaps (Fixed)

### Backfill & embeddings
| Gap | Fix |
|-----|-----|
| Large backfill can timeout | Added `maxPerRun` (default 500 via env `BACKFILL_EMBEDDINGS_MAX_PER_RUN`). Cron/startup process up to 500 per run. Manual script uses no limit. |
| embedExpenseText null not logged | Fixed: increment `errors` when embedding is null. |

### Cron
| Gap | Fix |
|-----|-----|
| FINJOE_WORKER_URL must be reachable | Added pre-check: fetch `/health` before running jobs. Exits immediately with clear error if worker unreachable. |
| Non-JSON 200 response | Fixed: treat `data.error` as failure. |

### Recurring expenses
| Gap | Fix |
|-----|-----|
| Category/cost center deleted | Validate category and cost center exist (and are active, tenant-scoped) before create. Skip with clear error. |
| Catch-up for missed runs | Create expenses for all missed dates (nextRunDate <= today), up to 12 per template per run. |

### Migration 021
| Gap | Fix |
|-----|-----|
| CREATE EXTENSION vector | Added comment in migration: Neon/Supabase support it; some Postgres need superuser. |

### Remaining (Lower Priority)
| Gap | Impact |
|-----|--------|
| Timezone | All dates UTC; no tenant-specific TZ. Would need tenant config. |

---

## Already Handled

- **Backfill skip when complete** – Counts `WHERE embedding IS NULL`; returns early if 0.
- **Duplicate recurring expenses** – Check before create; advance nextRunDate if exists.
- **updateRecurringTemplate nextRunDate** – Only recompute when schedule fields change.
- **Date formats** – parseDateToISO supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
- **searchExpensesByEmbedding** – try/catch returns [] on failure (e.g. column missing).
- **Concurrent backfill** – Both processes UPDATE same row; last write wins; no duplicates.
- **run-all-cron content-type** – Uses `contentType.includes("application/json")` before `res.json()`.
