# Railway PostgreSQL Migration (CLI) – Neon → Railway pgvector
# Run from repo root: .\scripts\railway-postgres-migrate.ps1
#
# Prerequisites:
#   - railway login
#   - railway link (to your project)
#   - NEON_DATABASE_URL in env – current Neon connection string
#   - pg_dump, pg_restore, psql on PATH
#
# Steps:
#   1. Deploy pgvector template via CLI
#   2. Migrate data (pg_dump from Neon → pg_restore to Railway)
#   3. Point finjoe-api (and cron/worker) to Railway Postgres via variable reference
#   4. Redeploy

$ErrorActionPreference = "Stop"

$RailwayPgService = if ($env:RAILWAY_PG_SERVICE) { $env:RAILWAY_PG_SERVICE } else { "pgvector" }

Write-Host "=== FinJoe Railway Postgres Migration (CLI) ===" -ForegroundColor Cyan

# Check railway
try {
  railway whoami 2>$null | Out-Null
} catch {
  Write-Host "Run 'railway login' first." -ForegroundColor Red
  exit 1
}

# Step 1: Deploy pgvector template
Write-Host ""
Write-Host "Step 1: Deploying pgvector template..." -ForegroundColor Yellow
railway deploy -t 3jJFCA

Write-Host ""
Write-Host "Wait for the pgvector service to be ACTIVE, then run the data migration." -ForegroundColor Yellow
Write-Host "Get Railway Postgres DATABASE_URL from: railway open -> pgvector service -> Variables"
Write-Host ""

# Step 2: Data migration
Write-Host "Step 2: Migrate data (run these manually with your URLs):" -ForegroundColor Yellow
Write-Host ""
Write-Host '  # Dump from Neon'
Write-Host '  pg_dump $env:NEON_DATABASE_URL --no-owner --no-acl -F c -f neon_backup.dump'
Write-Host ""
Write-Host '  # Restore to Railway (replace with your Railway Postgres DATABASE_URL)'
Write-Host '  pg_restore -d $env:RAILWAY_DATABASE_URL --no-owner --no-acl --clean --if-exists neon_backup.dump'
Write-Host ""
Write-Host '  # Or: run migrations on empty Railway DB first'
Write-Host '  $env:DATABASE_URL = $env:RAILWAY_DATABASE_URL; npm run db:migrate'
Write-Host ""

# Step 3 & 4: Set DATABASE_URL reference
Write-Host "Step 3: Point finjoe-api to Railway Postgres (after data migration):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  railway service link FinJoe"
$Ref = "DATABASE_URL=`${{ $RailwayPgService.DATABASE_URL }}"
Write-Host "  railway variable set `"$Ref`""
Write-Host "  railway up"
Write-Host ""
Write-Host "Step 4: If you have finjoe-cron or finjoe-worker:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  railway service link finjoe-cron"
Write-Host "  railway variable set `"$Ref`""
Write-Host ""
Write-Host "  railway service link finjoe-worker"
Write-Host "  railway variable set `"$Ref`""
Write-Host ""
Write-Host "Done. Redeploy services after setting variables." -ForegroundColor Green
Write-Host ""
