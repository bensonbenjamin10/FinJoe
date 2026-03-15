#!/bin/bash
# Railway PostgreSQL Migration (CLI) – Neon → Railway pgvector
# Run from repo root: ./scripts/railway-postgres-migrate.sh
#
# Prerequisites:
#   - railway login
#   - railway link (to your project)
#   - NEON_DATABASE_URL in env (or pass as arg) – current Neon connection string
#   - pg_dump, pg_restore, psql on PATH
#
# Steps:
#   1. Deploy pgvector template via CLI
#   2. Migrate data (pg_dump from Neon → pg_restore to Railway)
#   3. Point finjoe-api (and cron/worker) to Railway Postgres via variable reference
#   4. Redeploy

set -e

NEON_URL="${NEON_DATABASE_URL:-}"
RAILWAY_PG_SERVICE="${RAILWAY_PG_SERVICE:-pgvector}"

echo "=== FinJoe Railway Postgres Migration (CLI) ==="

# Check railway
if ! railway whoami &>/dev/null; then
  echo "Run 'railway login' first."
  exit 1
fi

# Step 1: Deploy pgvector template
echo ""
echo "Step 1: Deploying pgvector template..."
railway deploy -t 3jJFCA

echo ""
echo "Wait for the pgvector service to be ACTIVE, then run the data migration."
echo "Get Railway Postgres DATABASE_URL from: railway open → pgvector service → Variables"
echo ""

# Step 2: Data migration (user runs with env vars)
echo "Step 2: Migrate data (run these manually with your URLs):"
echo ""
echo "  # Dump from Neon"
echo "  pg_dump \"\$NEON_DATABASE_URL\" --no-owner --no-acl -F c -f neon_backup.dump"
echo ""
echo "  # Restore to Railway (replace with your Railway Postgres DATABASE_URL)"
echo "  pg_restore -d \"\$RAILWAY_DATABASE_URL\" --no-owner --no-acl --clean --if-exists neon_backup.dump"
echo ""
echo "  # Or: run migrations on empty Railway DB first, then import data"
echo "  DATABASE_URL=\"\$RAILWAY_DATABASE_URL\" npm run db:migrate"
echo ""

# Step 3 & 4: Set DATABASE_URL reference and redeploy
echo "Step 3: Point finjoe-api to Railway Postgres (after data migration):"
echo ""
echo "  railway service link FinJoe"
echo "  railway variable set \"DATABASE_URL=\${{ ${RAILWAY_PG_SERVICE}.DATABASE_URL }}\""
echo "  railway up"
echo ""
echo "Step 4: If you have finjoe-cron or finjoe-worker, set DATABASE_URL reference for each:"
echo ""
echo "  railway service link finjoe-cron"
echo "  railway variable set \"DATABASE_URL=\${{ ${RAILWAY_PG_SERVICE}.DATABASE_URL }}\""
echo ""
echo "  railway service link finjoe-worker"
echo "  railway variable set \"DATABASE_URL=\${{ ${RAILWAY_PG_SERVICE}.DATABASE_URL }}\""
echo ""
echo "Done. Redeploy services after setting variables."
echo ""
