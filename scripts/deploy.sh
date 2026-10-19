#!/usr/bin/env bash
# One-command deploy of Learn Chants to a FREE (Spark) Firebase project.
#
#   ./scripts/deploy.sh <your-google-email>                 (project from .firebaserc)
#   ./scripts/deploy.sh <project-id> <your-google-email>
#
# Works in Google Cloud Shell (https://shell.cloud.google.com) or any machine with
# Node 20+ and the Firebase CLI. It:
#   1. writes your email into firestore.rules (that Google account becomes Super Admin)
#   2. reads the Firebase web-app config into apps/web/.env.production.local
#   3. creates the Firestore database if needed
#   4. builds the PWA and deploys Hosting + Firestore rules/indexes (no Cloud Functions)
# Optional env (Google Drive for large teacher videos):
#   GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER, FIRESTORE_LOCATION (default asia-south1)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Accept "<email>" (project from .firebaserc) or "<project-id> <email>".
if [[ "${1:-}" == *@* ]]; then
  OWNER_EMAIL="$1"
  PROJECT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".firebaserc","utf8")).projects.default)')"
else
  PROJECT="${1:-}"
  OWNER_EMAIL="${2:-}"
fi
OWNER_EMAIL="$(printf '%s' "$OWNER_EMAIL" | tr '[:upper:]' '[:lower:]')"
if [[ -z "$PROJECT" || -z "$OWNER_EMAIL" || "$OWNER_EMAIL" != *@* ]]; then
  echo "usage: $0 <your-google-email>   (project from .firebaserc)" >&2
  echo "   or: $0 <firebase-project-id> <your-google-email>" >&2
  exit 1
fi
command -v firebase >/dev/null || npm i -g firebase-tools
command -v pnpm >/dev/null || npm i -g pnpm@10
FB="firebase --project $PROJECT"

echo "▶ Firebase login"
firebase projects:list >/dev/null 2>&1 || firebase login --no-localhost

echo "▶ Owner (Super Admin): $OWNER_EMAIL"
sed -i.bak -E "s/return '[^']*@[^']*';(\s*)$/return '$OWNER_EMAIL';\1/" firestore.rules && rm -f firestore.rules.bak
grep -q "return '$OWNER_EMAIL';" firestore.rules || { echo "Could not set the owner email in firestore.rules" >&2; exit 1; }

echo "▶ Web app config"
APP_ID="$($FB apps:list WEB --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result||[];console.log(r[0]?r[0].appId:"")})')"
if [[ -z "$APP_ID" ]]; then
  $FB apps:create WEB "Learn Chants" >/dev/null
  APP_ID="$($FB apps:list WEB --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result[0].appId))')"
fi
$FB apps:sdkconfig WEB "$APP_ID" --json | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const r = JSON.parse(s).result; const c = r.sdkConfig || r; const e = process.env;
  console.log([
    `VITE_FIREBASE_API_KEY=${c.apiKey}`,
    `VITE_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
    `VITE_FIREBASE_PROJECT_ID=${c.projectId}`,
    `VITE_FIREBASE_APP_ID=${c.appId}`,
    "VITE_USE_EMULATORS=false",
    `VITE_APPCHECK_SITE_KEY=${e.APPCHECK_SITE_KEY || ""}`,
    `VITE_GOOGLE_CLIENT_ID=${e.GOOGLE_CLIENT_ID || ""}`,
    `VITE_GOOGLE_API_KEY=${e.GOOGLE_API_KEY || ""}`,
    `VITE_GOOGLE_APP_ID=${e.GOOGLE_PROJECT_NUMBER || ""}`,
  ].join("\n"));
});' > apps/web/.env.production.local

echo "▶ Enabling Firestore APIs (free on the Spark plan)"
if command -v gcloud >/dev/null; then
  gcloud services enable firestore.googleapis.com firebaserules.googleapis.com --project "$PROJECT"
else
  echo "  gcloud not found: enable the Cloud Firestore API at"
  echo "  https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=$PROJECT"
fi

echo "▶ Firestore database"
if ! $FB firestore:databases:get "(default)" >/dev/null 2>&1; then
  # A freshly enabled API can take a minute to propagate: retry.
  for attempt in 1 2 3 4 5 6; do
    if $FB firestore:databases:create "(default)" --location "${FIRESTORE_LOCATION:-asia-south1}"; then break; fi
    [[ $attempt == 6 ]] && { echo "Could not create the Firestore database; re-run this script in a few minutes." >&2; exit 1; }
    echo "  waiting for the API to become available (attempt $attempt/6)…"; sleep 20
  done
fi

echo "▶ Building"
pnpm install --frozen-lockfile
pnpm --filter web build

echo "▶ Deploying (Hosting + Firestore rules/indexes)"
$FB deploy --only hosting,firestore

cat <<EOF

✅ Live: https://$PROJECT.web.app
   Teacher portal (not linked from the learner app): https://$PROJECT.web.app/admin/login
   Click "Sign in with Google" as $OWNER_EMAIL: that first sign-in makes you Super Admin.
EOF
