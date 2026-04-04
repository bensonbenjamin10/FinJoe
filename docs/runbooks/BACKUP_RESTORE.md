# Backup and restore (S3 archive + volume)

FinJoe can upload **daily backups** to an **S3-compatible bucket** (e.g. Railway Storage Buckets) for disaster recovery. **Live** media and reads still use **`MEDIA_STORAGE_PATH`** on the FinJoe server; the bucket holds **archive copies** only.

## What gets backed up

| Artifact | S3 key (under prefix) | Notes |
|----------|------------------------|--------|
| PostgreSQL | `backups/YYYY-MM-DD/database.dump` | `pg_dump -Fc` custom format |
| Media volume | `backups/YYYY-MM-DD/media.tar.gz` | `tar -czf` of the directory at `MEDIA_STORAGE_PATH` (optional) |

Default prefix: `backups/` (override with `BACKUP_S3_PREFIX`).

## Required environment variables

**On the FinJoe API service** (the process that runs `GET /cron/backup` or `npm run backup:s3`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Source for `pg_dump` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_ENDPOINT_URL` | e.g. `https://storage.railway.app` |
| `AWS_DEFAULT_REGION` | e.g. `auto` |
| `AWS_S3_BUCKET_NAME` | Bucket name from Railway Credentials tab |
| `MEDIA_STORAGE_PATH` | Optional; if set and not skipped, media is archived |
| `CRON_SECRET` | Protects `GET /cron/backup?secret=` |

**Optional:**

| Variable | Purpose |
|----------|---------|
| `BACKUP_SKIP_MEDIA=1` | Upload DB only (faster daily runs; skip large `tar`) |
| `AWS_S3_FORCE_PATH_STYLE=true` | Some S3-compatible endpoints need path-style access |
| `BACKUP_S3_PREFIX` | Override default `backups` prefix |

**On the Railway cron service** (`MODE=cron` / `run-all-cron.mjs`), set **`FINJOE_APP_URL`** or **`PUBLIC_APP_URL`** to your **main** HTTPS URL (e.g. `https://finjoe.app`) so the cron runner can call **`GET /cron/backup`** on the service that **mounts the media volume**. The worker URL alone is not sufficient for filesystem backup.

## Runtime requirements

- **`pg_dump`** and **`tar`** must be on `PATH` in the container (e.g. install `postgresql-client` in the image if missing).
- **Backup must run on the same machine** that has **`DATABASE_URL`** and (for media) the **mounted volume**.

## How to trigger

1. **Scheduled:** Railway cron runs `run-all-cron.mjs`; if `FINJOE_APP_URL` is set, it calls the main app after worker jobs.
2. **HTTP:** `GET https://<your-app>/cron/backup?secret=<CRON_SECRET>`
3. **CLI:** `npm run backup:s3` (same env as the server)

## Admin UI

**Super admin → Cron** includes **Backup to S3** for manual runs (same as trigger API).

## Restore (high level)

1. **Database:** Download `database.dump` from the bucket, then:
   ```bash
   pg_restore --clean --if-exists -d "$DATABASE_URL" database.dump
   ```
   Use a maintenance window; verify `DATABASE_URL` points at the target instance. Test on a copy first.

2. **Media:** Download `media.tar.gz`, stop the app, extract into the parent of the media folder so `MEDIA_STORAGE_PATH` matches (e.g. extract `finjoe-media` under `/data` if `MEDIA_STORAGE_PATH=/data/finjoe-media`).

3. Redeploy/restart the app.

## Retention

The app does not delete old S3 objects. Configure **lifecycle rules** in the bucket provider or a periodic cleanup script if needed.

## Optional online fallback

Serving media from S3 when a file is missing on disk is **not** implemented; restore from backup instead.
