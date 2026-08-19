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

echo "==> Syncing assets/icons/ (wiki class art + local UI icons)"
ssh "$PI_HOST" "mkdir -p '${PI_PATH}/assets/icons' '${PI_PATH}/dist/assets/icons'"
if command -v rsync >/dev/null 2>&1; then
  rsync -avz "${ROOT}/assets/icons/" "${PI_HOST}:${PI_PATH}/assets/icons/"
  rsync -avz "${ROOT}/assets/icons/" "${PI_HOST}:${PI_PATH}/dist/assets/icons/"
else
  scp -r "${ROOT}/assets/icons/"* "${PI_HOST}:${PI_PATH}/assets/icons/"
  scp -r "${ROOT}/assets/icons/"* "${PI_HOST}:${PI_PATH}/dist/assets/icons/"
fi

echo "==> Syncing server/runtime files"
for f in server.py server.js armory_proxy.py profiles.js requirements.txt package.json package-lock.json; do
  if [[ -f "${ROOT}/${f}" ]]; then
    scp "${ROOT}/${f}" "${PI_HOST}:${PI_PATH}/"
  fi
done

echo "==> Syncing service worker (root /sw.js + dist/sw.js + public/sw.js)"
ssh "$PI_HOST" "mkdir -p '${PI_PATH}/public'"
for sw in sw.js public/sw.js; do
  if [[ -f "${ROOT}/${sw}" ]]; then
    scp "${ROOT}/${sw}" "${PI_HOST}:${PI_PATH}/${sw}"
  fi
done
if [[ -f "${ROOT}/dist/sw.js" ]]; then
  scp "${ROOT}/dist/sw.js" "${PI_HOST}:${PI_PATH}/dist/sw.js"
fi

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

echo "==> Verifying live /sw.js CACHE_VERSION"
LOCAL_SW_VER="$(grep -m1 \"CACHE_VERSION\" \"${ROOT}/sw.js\" | sed \"s/.*'\\([^']*\\)'.*/\\1/\")"
REMOTE_SW_VER="$(ssh \"$PI_HOST\" \"curl -fsS http://127.0.0.1:6100/sw.js | grep -m1 CACHE_VERSION | sed \\\"s/.*'\\\\([^']*\\\\)'.*/\\\\1/\\\"\")"
if [[ \"$LOCAL_SW_VER\" == \"$REMOTE_SW_VER\" && -n \"$LOCAL_SW_VER\" ]]; then
  echo \"OK: live /sw.js CACHE_VERSION=${LOCAL_SW_VER}\"
else
  echo \"WARN: /sw.js version mismatch (local=${LOCAL_SW_VER}, remote=${REMOTE_SW_VER})\" >&2
fi

echo "Deploy complete."
