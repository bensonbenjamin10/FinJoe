# Migration & Cron Setup

## Session Store Migration

The session store migration (`019_session_store.sql`) creates the `session` table for PostgreSQL-backed sessions. Run when `DATABASE_URL` is reachable:

```bash
npm run db:migrate
```

If the migration fails with "relation already exists", the table was created by `connect-pg-simple`'s `createTableIfMissing`—no action needed.

## Cron Jobs

The worker exposes two cron endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /cron/weekly-insights?secret=CRON_SECRET` | Sends expense/income summaries to admin/finance WhatsApp contacts |
| `GET /cron/recurring-expenses?secret=CRON_SECRET` | Generates draft expenses from recurring templates (rent, salaries, etc.) |

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
- **Weekly insights**: runs only on Mondays (sends expense/income summary to admin/finance)

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
