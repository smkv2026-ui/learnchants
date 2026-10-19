#!/usr/bin/env bash
# One-command deploy of Learn Chants to your Firebase project.
#
#   ./scripts/deploy.sh <project-id> <your-email>
#
# Works in Google Cloud Shell (https://shell.cloud.google.com) or any machine with
# Node 20+, Python 3.12 and the Firebase CLI. It:
#   1. creates/reads the Firebase web app config and writes apps/web/.env.production.local
#   2. writes functions/.env.<project-id> (APP_URL, MOCK_DRIVE=false, owner email)
#   3. creates the secrets (random keys for encryption/signing; Google OAuth from env or a placeholder)
#   4. builds the PWA and runs `firebase deploy`
# Optional env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Drive), GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER (Picker),
#               APPCHECK_SITE_KEY.
set -euo pipefail

PROJECT="${1:-}"
OWNER_EMAIL="${2:-}"
if [[ -z "$PROJECT" || -z "$OWNER_EMAIL" ]]; then
  echo "usage: $0 <firebase-project-id> <your-email (becomes Super Admin on first sign-in)>" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FB="firebase --project $PROJECT --non-interactive"
command -v firebase >/dev/null || npm i -g firebase-tools
command -v pnpm >/dev/null || npm i -g pnpm@10

echo "▶ Checking Firebase login…"
firebase projects:list >/dev/null 2>&1 || firebase login --no-localhost

echo "▶ Web app config"
APP_ID="$($FB apps:list WEB --json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result",[]); print(r[0]["appId"] if r else "")')"
if [[ -z "$APP_ID" ]]; then
  $FB apps:create WEB "Learn Chants" >/dev/null
  APP_ID="$($FB apps:list WEB --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"][0]["appId"])')"
fi
$FB apps:sdkconfig WEB "$APP_ID" --json | python3 - "$PROJECT" > apps/web/.env.production.local <<'PY'
import json, os, sys
cfg = json.load(sys.stdin)["result"]
cfg = cfg.get("sdkConfig", cfg)
env = os.environ
print(f"VITE_FIREBASE_API_KEY={cfg['apiKey']}")
print(f"VITE_FIREBASE_AUTH_DOMAIN={cfg['authDomain']}")
print(f"VITE_FIREBASE_PROJECT_ID={cfg['projectId']}")
print(f"VITE_FIREBASE_STORAGE_BUCKET={cfg.get('storageBucket', '')}")
print(f"VITE_FIREBASE_APP_ID={cfg['appId']}")
print("VITE_USE_EMULATORS=false")
print(f"VITE_APPCHECK_SITE_KEY={env.get('APPCHECK_SITE_KEY', '')}")
print(f"VITE_GOOGLE_CLIENT_ID={env.get('GOOGLE_CLIENT_ID', '')}")
print(f"VITE_GOOGLE_API_KEY={env.get('GOOGLE_API_KEY', '')}")
print(f"VITE_GOOGLE_APP_ID={env.get('GOOGLE_PROJECT_NUMBER', '')}")
PY

echo "▶ Function params"
cat > "functions/.env.$PROJECT" <<EOF
APP_URL=https://$PROJECT.web.app
MOCK_DRIVE=false
ENFORCE_APP_CHECK=false
BOOTSTRAP_SUPER_ADMIN_EMAIL=$OWNER_EMAIL
EOF

echo "▶ Secrets (Secret Manager)"
set_secret() { # name value
  printf '%s' "$2" | $FB functions:secrets:set "$1" --data-file=- --force >/dev/null
  echo "  set $1"
}
has_secret() { $FB functions:secrets:access "$1" >/dev/null 2>&1; }
has_secret TOKEN_ENCRYPTION_KEY || set_secret TOKEN_ENCRYPTION_KEY "$(openssl rand -base64 32)"
has_secret MEDIA_TOKEN_SECRET || set_secret MEDIA_TOKEN_SECRET "$(openssl rand -base64 48)"
if [[ -n "${GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  set_secret GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
  set_secret GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
else
  # Placeholders let everything else deploy; "Connect Google Drive" explains what is missing.
  has_secret GOOGLE_CLIENT_ID || set_secret GOOGLE_CLIENT_ID "not-configured"
  has_secret GOOGLE_CLIENT_SECRET || set_secret GOOGLE_CLIENT_SECRET "not-configured"
fi

echo "▶ Building"
PY312="$(command -v python3.12 || command -v python3)"
[[ -d functions/venv ]] || "$PY312" -m venv functions/venv
functions/venv/bin/pip install -q -r functions/requirements.txt
pnpm install --frozen-lockfile
pnpm --filter web build

echo "▶ Deploying"
$FB deploy --only hosting,functions,firestore,storage

cat <<EOF

✅ Live: https://$PROJECT.web.app
   Teacher portal (not linked from the learner app): https://$PROJECT.web.app/admin/login
   Sign in there with Google as $OWNER_EMAIL: that first sign-in makes you Super Admin.
EOF
