# Migration & Cron Setup

## Database Migrations (drizzle-kit)

FinJoe uses **drizzle-kit** to manage schema migrations. The schema source of truth is `shared/schema.ts`.

### Workflow

1. Edit `shared/schema.ts` (add/change columns, tables, relations)
2. Run `npm run db:generate` — auto-generates a SQL migration file in `drizzle/`
3. Review the generated SQL in `drizzle/`
4. Run `npm run db:migrate` — applies only **new** migrations (tracked in `__drizzle_migrations`)
5. Commit both the schema change and the generated migration file

### Commands

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Diff `shared/schema.ts` against the last snapshot and generate a new SQL migration |
| `npm run db:migrate` | Apply pending migrations (only runs files not yet tracked) |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser at `https://local.drizzle.studio`) |
| `npm run db:pull` | Introspect the live DB into a snapshot (useful for debugging schema drift) |

### Key files

- `drizzle.config.ts` — drizzle-kit configuration (schema path, output dir, DB credentials)
- `drizzle/` — generated migration SQL files and metadata (`meta/_journal.json`, snapshots)
- `scripts/run-migrations.mjs` — migration runner using `drizzle-orm/node-postgres/migrator`
- `migrations-legacy/` — archived hand-written SQL migrations (001–034), kept for reference only

### Notes

- The `session` table (used by `connect-pg-simple`) and the `embedding vector(768)` column on `expenses` (pgvector) exist in the DB but are not modeled in `shared/schema.ts`. They are managed outside Drizzle via raw SQL and remain untouched by drizzle-kit.
- The baseline migration (`drizzle/0000_chunky_reaper.sql`) is a no-op — it represents the initial schema that was already applied before drizzle-kit was adopted.

---

## Railway Postgres Migration (Neon → Railway)

To migrate from Neon to Railway Postgres (resolves Railway→Neon connectivity issues):

**Option A: Docker + Railway CLI** (no pg_dump/pg_restore install needed)

```powershell
$env:NEON_DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"
.\scripts\railway-postgres-migrate-docker.ps1
```

**Option B: Manual steps** (requires PostgreSQL client tools)

```bash
./scripts/railway-postgres-migrate.sh   # Linux/macOS
.\scripts\railway-postgres-migrate.ps1  # Windows PowerShell
```

The scripts use Railway CLI to:
1. Deploy the pgvector template (`railway deploy -t 3jJFCA`)
2. Dump from Neon → restore to Railway (Docker script does both; manual script guides you)
3. Set `DATABASE_URL=${{ pgvector.DATABASE_URL_PRIVATE }}` on finjoe-api, cron, worker (use PRIVATE for internal Railway services)
4. Redeploy

Use the **pgvector** template (not default Postgres) for expense embeddings (RAG).

**After migration:** Rotate Neon DB password (credentials were used in migration). Delete `neon_backup.dump` locally if no longer needed. Remove Neon from `.env` if present.

**Restore fails with "no connection to the server"?** Railway's `DATABASE_URL` is private (internal-only). For local restore you need the public URL:

1. Railway → pgvector → Settings → Networking → enable **Public Networking** (TCP proxy)
2. Copy `DATABASE_PUBLIC_URL` from Variables
3. Run: `$env:RAILWAY_DATABASE_PUBLIC_URL = "postgresql://..."; .\scripts\railway-postgres-migrate-docker.ps1`

**Restore fails with "input file is too short"?** Docker on Windows can fail to mount paths with spaces. Manual restore from a path without spaces (run from repo root after dump):

```powershell
$RestoreDir = Join-Path $env:TEMP "finjoe_restore"
New-Item -ItemType Directory -Force -Path $RestoreDir | Out-Null
Copy-Item ".\neon_backup.dump" $RestoreDir
$MountSource = $RestoreDir -replace '\\', '/'
docker run --rm -v "${MountSource}:/backup" -e "RESTORE_URL=$env:RAILWAY_DATABASE_PUBLIC_URL" postgres:18 sh -c "pg_restore -d \"\$RESTORE_URL\" --no-owner --no-acl --clean --if-exists /backup/neon_backup.dump"
```

**Restore fails with "unexpected message type 0x58 during COPY from stdin"?** This occurs when `pg_restore` disconnects during COPY (often due to version mismatch or timeout). Fixes:

1. **Use postgres:18** – Railway runs PostgreSQL 18; the migration script uses `postgres:18` to match. If using manual restore, ensure the Docker image matches (e.g. `postgres:18`).
2. **Fallback: use plain SQL format** – Dump and restore as SQL instead of custom format (avoids COPY protocol; slower but more robust):
   ```powershell
   docker run --rm -v "${BackupPath}:/backup" postgres:18 pg_dump $env:NEON_DATABASE_URL --no-owner --no-acl -F p -f /backup/neon_backup.sql
   docker run --rm -v "${BackupPath}:/backup" -e "RESTORE_URL=$env:RAILWAY_DATABASE_PUBLIC_URL" postgres:18 sh -c "psql -d \"\$RESTORE_URL\" -f /backup/neon_backup.sql"
   ```
   Note: Plain format uses INSERTs instead of COPY; for large datasets this is slower but avoids the protocol error.

## Session Store

The `session` table is managed by `connect-pg-simple` (with `createTableIfMissing`). It is not part of the Drizzle schema and is not affected by `db:generate` or `db:migrate`. The original SQL is preserved in `migrations-legacy/019_session_store.sql` for reference.

## Cron Jobs

The worker exposes three cron endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /cron/weekly-insights?secret=CRON_SECRET` | Sends expense/income summaries to admin/finance WhatsApp contacts |
| `GET /cron/recurring-expenses?secret=CRON_SECRET` | Generates draft expenses from recurring templates (rent, salaries, etc.) |
| `GET /cron/backfill-embeddings?secret=CRON_SECRET` | Backfills expense embeddings for RAG/semantic search (processes expenses where embedding IS NULL) |

### Weekly Insights

### 1. Set environment variables

In `.env` (or your deployment config):

```
CRON_SECRET=your-random-secret-string
FINJOE_WORKER_URL=https://your-worker-domain.com   # e.g. https://finjoe-worker.railway.app
```

### 2. Run manually

```bash
npm run cron:weekly-insights
```

Or with curl:

```bash
curl "https://your-worker-url/cron/weekly-insights?secret=YOUR_CRON_SECRET"
```

### 3. Schedule with system cron (Linux/macOS)

```bash
# Every Monday at 9am
0 9 * * 1 curl -s "https://your-worker-url/cron/weekly-insights?secret=YOUR_CRON_SECRET"
```

### 4. Railway (recommended)

#### Option A: Railway CLI

From the repo root:

```bash
# 1. Login and link project
railway login
railway link

# 2. Add cron service
railway add --service finjoe-cron

# 3. Link to the cron service
railway service link finjoe-cron

# 4. Set variables (replace YOUR_WORKER_URL with worker's Railway domain)
railway variable set MODE=cron
railway variable set CRON_SECRET=$(openssl rand -hex 16)
railway variable set FINJOE_WORKER_URL=https://YOUR_WORKER_URL

# 5. In Railway Dashboard: finjoe-cron → Settings → Config
#    Set "Config File Path" to: railway.cron.json

# 6. Deploy
railway up
```

Or run the setup script:
```bash
./scripts/railway-cron-setup.sh   # Linux/macOS
.\scripts\railway-cron-setup.ps1 # Windows PowerShell
```

The `railway.cron.json` config sets `cronSchedule: "5 0 * * *"` (daily at 00:05 UTC) and `startCommand: "node start.mjs"`. The cron service must have `MODE=cron` set. Each run executes `scripts/run-all-cron.mjs`, which:
- **Recurring expenses**: runs every day (generates draft expenses from templates)
- **Backfill embeddings**: runs every day (processes expenses without embeddings for RAG/semantic search)
- **Weekly insights**: runs only on Mondays (sends expense/income summary to admin/finance)

Additionally, the **worker** runs the embeddings backfill on startup (non-blocking), so any expenses missing embeddings get processed when the worker restarts.

#### Option B: Railway Dashboard

Add a **Cron Service** in your Railway project:

1. **New service** – In your project, click **+ New** → **GitHub Repo** (same repo) or **Empty Service**.
2. **Source** – If new from repo: same repo as your app. Set **Root Directory** to `/` (or leave default).
3. **Build** – Build command: `npm install` (or reuse your main build). The script needs no build.
4. **Start command** – Set to:
   ```
   node scripts/run-weekly-insights.mjs
   ```
5. **Cron Schedule** – In the service **Settings**, find **Cron Schedule** and set:
   ```
   0 9 * * 1
   ```
   (Runs every Monday at 9:00 AM UTC.)
6. **Variables** – Add:
   - `MODE=cron` – Required so the entry point runs the cron script instead of the server.
   - `CRON_SECRET` – Same value as on your worker (generate a random string).
   - `FINJOE_WORKER_URL` – Your worker’s public URL, e.g. `https://finjoe.app` (or your worker’s domain).
   - `DATABASE_URL` – Not required for the cron service (it only calls the worker over HTTP).
7. **Deploy** – Deploy the service. It will run on the schedule and exit after each run.

### 5. Other schedulers

- **cron-job.org** – Create a job, set URL to `https://your-worker-url/cron/weekly-insights?secret=YOUR_CRON_SECRET`, schedule weekly.
- **GitHub Actions** – `workflow_dispatch` or `schedule` trigger that calls the endpoint.

### 6. Local testing

With the worker running (`npm run worker:dev`):

```bash
# Run all cron jobs (recurring + weekly if Monday)
FINJOE_WORKER_URL=http://localhost:5001 CRON_SECRET=test node scripts/run-all-cron.mjs

# Or run individually:
npm run cron:weekly-insights
npm run cron:recurring-expenses
```

### 7. Recurring expenses (daily)

The recurring expenses job generates draft expenses from templates (monthly rent, salaries, etc.). It runs automatically via the Railway cron service (daily at 00:05 UTC). To run manually:

```bash
npm run cron:recurring-expenses
```

### 8. Backfill embeddings (daily + on worker startup)

The embeddings backfill processes expenses where `embedding IS NULL` for RAG/semantic search. It runs:
- **On worker startup** (non-blocking, in background)
- **Daily via cron** (as part of `run-all-cron.mjs`)

Requires `GEMINI_API_KEY`. To run manually:

```bash
npm run backfill:embeddings
# Or via worker endpoint:
curl "https://your-worker-url/cron/backfill-embeddings?secret=YOUR_CRON_SECRET"
```
