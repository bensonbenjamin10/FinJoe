# Railway PostgreSQL Migration (Docker + Railway CLI) – Neon → Railway pgvector
# No pg_dump/pg_restore needed – uses Docker. Run from repo root.
#
# Prerequisites: Docker, railway login, railway link, pgvector service deployed
#   (run .\scripts\railway-postgres-migrate.ps1 first to deploy pgvector)
#
# Usage:
#   $env:NEON_DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"
#   # Optional: if restore fails with "no connection", get public URL from Railway -> pgvector -> Variables
#   $env:RAILWAY_DATABASE_PUBLIC_URL = "postgresql://..."
#   .\scripts\railway-postgres-migrate-docker.ps1

$ErrorActionPreference = "Stop"

$NeonUrl = $env:NEON_DATABASE_URL
$DumpFile = "neon_backup.dump"
$BackupPath = (Get-Location).Path

Write-Host "=== FinJoe Railway Postgres Migration (Docker + Railway CLI) ===" -ForegroundColor Cyan

if (-not $NeonUrl) {
  Write-Host "Set NEON_DATABASE_URL first:" -ForegroundColor Red
  Write-Host '  $env:NEON_DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"'
  exit 1
}

# Check Docker
try {
  docker --version 2>$null | Out-Null
} catch {
  Write-Host "Docker is required. Install Docker Desktop." -ForegroundColor Red
  exit 1
}

# Check Railway
try {
  railway whoami 2>$null | Out-Null
} catch {
  Write-Host "Run 'railway login' and 'railway link' first." -ForegroundColor Red
  exit 1
}

# Step 1: Dump from Neon (Docker) – use postgres:17 to match Neon server version
Write-Host ""
Write-Host "Step 1: Dumping from Neon..." -ForegroundColor Yellow
docker run --rm -v "${BackupPath}:/backup" postgres:17 pg_dump $NeonUrl --no-owner --no-acl -F c -f /backup/$DumpFile

if (-not (Test-Path $DumpFile)) {
  Write-Host "Dump failed." -ForegroundColor Red
  exit 1
}
$DumpSize = (Get-Item $DumpFile).Length
if ($DumpSize -lt 100) {
  Write-Host "Dump file is empty or too small ($DumpSize bytes). Check pg_dump output above." -ForegroundColor Red
  exit 1
}
Write-Host "Dump saved to $DumpFile ($([math]::Round($DumpSize/1MB, 2)) MB)" -ForegroundColor Green

# Step 2: Restore to Railway (use public URL – private DATABASE_URL is unreachable from local machine)
# Use docker cp + exec to avoid volume mount issues on Windows (paths with spaces, etc.)
Write-Host ""
Write-Host "Step 2: Restoring to Railway pgvector..." -ForegroundColor Yellow
railway service link pgvector
$RestoreUrl = $env:RAILWAY_DATABASE_PUBLIC_URL
if (-not $RestoreUrl) {
  Write-Host "Set RAILWAY_DATABASE_PUBLIC_URL first (from pgvector Variables, enable Public Networking if needed)." -ForegroundColor Red
  exit 1
}
Write-Host "  Using RAILWAY_DATABASE_PUBLIC_URL" -ForegroundColor Gray
$ContainerId = docker run -d postgres:17 tail -f /dev/null
try {
  docker cp $DumpFile "${ContainerId}:/tmp/$DumpFile"
  docker exec -e "RESTORE_URL=$RestoreUrl" $ContainerId sh -c 'pg_restore -d "$RESTORE_URL" --no-owner --no-acl --clean --if-exists /tmp/neon_backup.dump'
} finally {
  docker stop $ContainerId 2>$null
  docker rm $ContainerId 2>$null
}

Write-Host "Restore complete." -ForegroundColor Green

# Step 3: Point finjoe-api to Railway Postgres
Write-Host ""
Write-Host "Step 3: Point finjoe-api to Railway Postgres:" -ForegroundColor Yellow
railway service link FinJoe
railway variable set "DATABASE_URL=`${{ pgvector.DATABASE_URL_PRIVATE }}"
railway up

Write-Host ""
Write-Host "Done. If you have finjoe-cron or finjoe-worker, run:" -ForegroundColor Green
Write-Host "  railway service link finjoe-cron"
Write-Host '  railway variable set "DATABASE_URL=${{ pgvector.DATABASE_URL_PRIVATE }}"'
Write-Host "  railway service link finjoe-worker"
Write-Host '  railway variable set "DATABASE_URL=${{ pgvector.DATABASE_URL_PRIVATE }}"'
Write-Host ""
