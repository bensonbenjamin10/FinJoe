# Migration & Cron Setup

## Session Store Migration

The session store migration (`019_session_store.sql`) creates the `session` table for PostgreSQL-backed sessions. Run when `DATABASE_URL` is reachable:

```bash
npm run db:migrate
```

If the migration fails with "relation already exists", the table was created by `connect-pg-simple`'s `createTableIfMissing`—no action needed.

## Weekly Insights Cron

The worker exposes `GET /cron/weekly-insights?secret=CRON_SECRET` to send expense/income summaries to admin/finance WhatsApp contacts.

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

### 4. Schedule with external services

- **cron-job.org** – Create a job, set URL to `https://your-worker-url/cron/weekly-insights?secret=YOUR_CRON_SECRET`, schedule as weekly
- **Railway** – Use cron job add-on or a separate cron service
- **GitHub Actions** – `workflow_dispatch` or `schedule` trigger calling the endpoint

### 5. Local testing

With the worker running (`npm run worker:dev`):

```bash
FINJOE_WORKER_URL=http://localhost:5001 CRON_SECRET=test npm run cron:weekly-insights
```
