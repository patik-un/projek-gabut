#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo " Event Booth Studio - macOS Build"
echo "========================================"

cd "$ROOT_DIR"

echo
echo "[1/4] Preparing Python backend environment..."
cd backend

if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

cd "$ROOT_DIR/frontend"

echo
echo "[2/4] Installing frontend dependencies..."
npm install

if [ -n "${GOOGLE_CLIENT_SECRETS_JSON:-}" ]; then
  echo
  echo "Restoring Google OAuth client secrets from GOOGLE_CLIENT_SECRETS_JSON..."
  mkdir -p "$ROOT_DIR/backend/auth"
  printf '%s' "$GOOGLE_CLIENT_SECRETS_JSON" > "$ROOT_DIR/backend/auth/client_secrets.json"
fi

echo
echo "[3/4] Preparing backend seed data..."
npm run prepare:backend

echo
echo "[4/4] Building macOS DMG installer..."
npm run tauri build -- --bundles dmg

echo
echo "========================================"
echo " Build selesai!"
echo " Hasil: frontend/src-tauri/target/release/bundle/dmg/"
echo "========================================"
