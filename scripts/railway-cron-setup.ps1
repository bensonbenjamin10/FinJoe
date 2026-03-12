# Railway CLI: Set up weekly insights cron service
# Run from repo root: .\scripts\railway-cron-setup.ps1
#
# Prerequisites:
#   - railway login
#   - railway link (to your project)

$ErrorActionPreference = "Stop"

Write-Host "=== FinJoe Cron Service Setup (Railway CLI) ===" -ForegroundColor Cyan

# Check railway is logged in
try {
  railway whoami 2>$null | Out-Null
} catch {
  Write-Host "Run 'railway login' first." -ForegroundColor Red
  exit 1
}

# Add cron service
Write-Host ""
Write-Host "Adding cron service..."
railway add --service finjoe-cron 2>$null; if ($LASTEXITCODE -ne 0) { Write-Host "(Service may already exist)" }

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Link to the cron service:"
Write-Host "   railway service link finjoe-cron"
Write-Host ""
Write-Host "2. Set variables (replace YOUR_WORKER_URL with your worker's Railway domain):"
Write-Host '   railway variable set CRON_SECRET=(New-Guid).Guid'
Write-Host "   railway variable set FINJOE_WORKER_URL=https://YOUR_WORKER_URL"
Write-Host ""
Write-Host "3. In Railway Dashboard: Service finjoe-cron -> Settings -> Config"
Write-Host "   Set 'Config File Path' to: railway.cron.json"
Write-Host ""
Write-Host "4. Deploy:"
Write-Host "   railway up"
Write-Host ""
