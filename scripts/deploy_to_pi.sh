#!/usr/bin/env bash
# Deploy IchaCalc to Raspberry Pi (production serves Vite dist/, not source root).
set -euo pipefail

PI_HOST="${PI_HOST:-pihole@pihole}"
PI_PATH="${PI_PATH:-/opt/stacks/IchaCalc}"
SERVICE="${SERVICE:-ehp-calculator}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building production bundle (dist/)"
cd "$ROOT"
npm run build

echo "==> Syncing dist/ to ${PI_HOST}:${PI_PATH}/dist/"
ssh "$PI_HOST" "mkdir -p '${PI_PATH}/dist'"
if command -v rsync >/dev/null 2>&1; then
  rsync -avz --delete "${ROOT}/dist/" "${PI_HOST}:${PI_PATH}/dist/"
else
  scp -r "${ROOT}/dist/"* "${PI_HOST}:${PI_PATH}/dist/"
fi

echo "==> Syncing data/loot/"
ssh "$PI_HOST" "mkdir -p '${PI_PATH}/data/loot'"
if command -v rsync >/dev/null 2>&1; then
  rsync -avz "${ROOT}/data/loot/" "${PI_HOST}:${PI_PATH}/data/loot/"
else
  scp -r "${ROOT}/data/loot/"* "${PI_HOST}:${PI_PATH}/data/loot/"
fi

echo "==> Syncing server/runtime files"
for f in server.py server.js armory_proxy.py profiles.js requirements.txt package.json package-lock.json; do
  if [[ -f "${ROOT}/${f}" ]]; then
    scp "${ROOT}/${f}" "${PI_HOST}:${PI_PATH}/"
  fi
done

echo "==> Installing Node dependencies on Pi (session-file-store, etc.)"
ssh "$PI_HOST" "cd '${PI_PATH}' && npm install --omit=dev"

echo "==> Syncing data/loot/"
if command -v rsync >/dev/null 2>&1; then
  ssh "$PI_HOST" "mkdir -p '${PI_PATH}/data/loot'"
  rsync -avz "${ROOT}/data/loot/" "${PI_HOST}:${PI_PATH}/data/loot/"
else
  ssh "$PI_HOST" "mkdir -p '${PI_PATH}/data/loot'"
  scp -r "${ROOT}/data/loot/"* "${PI_HOST}:${PI_PATH}/data/loot/"
fi

echo "==> Restarting ${SERVICE}"
ssh "$PI_HOST" "sudo systemctl restart ${SERVICE} && sleep 2 && sudo systemctl is-active ${SERVICE}"

echo "==> Verifying live bundle contains UI scale markup"
ssh "$PI_HOST" "curl -fsS http://127.0.0.1:6100/index.html | grep -q ui-scale-settings && echo OK: ui-scale-settings present in served index.html"

echo "Deploy complete."
