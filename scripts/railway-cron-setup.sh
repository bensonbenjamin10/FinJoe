#!/bin/bash
# Railway CLI: Set up cron service (recurring expenses daily, weekly insights on Mondays)
# Run from repo root: ./scripts/railway-cron-setup.sh
#
# Prerequisites:
#   - railway login
#   - railway link (to your project)
#
# You'll need: CRON_SECRET, FINJOE_WORKER_URL (worker's public domain)

set -e

echo "=== FinJoe Cron Service Setup (Railway CLI) ==="

# Check railway is logged in
if ! railway whoami &>/dev/null; then
  echo "Run 'railway login' first."
  exit 1
fi

# Add cron service
echo ""
echo "Adding cron service..."
railway add --service finjoe-cron --variables "NODE_ENV=production" || true

echo ""
echo "Next steps (run these with the cron service selected):"
echo ""
echo "  1. Link to the cron service:"
echo "     railway service link finjoe-cron"
echo ""
echo "  2. Set config file path in Railway Dashboard:"
echo "     Service Settings → Config → Config File Path: railway.cron.json"
echo ""
echo "  3. Set variables:"
echo "     railway variable set CRON_SECRET=your-secret-here"
echo "     railway variable set FINJOE_WORKER_URL=https://your-worker-domain.up.railway.app"
echo ""
echo "  4. Deploy:"
echo "     railway up"
echo ""
echo "Or set variables in one go:"
echo "  railway variable set CRON_SECRET=\$(openssl rand -hex 16) FINJOE_WORKER_URL=https://YOUR_WORKER_URL"
echo ""
