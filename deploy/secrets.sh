#!/usr/bin/env bash
# Create / rotate app secrets in GCP Secret Manager and grant the Cloud Run
# runtime service account access. Secret values are never written to disk.
#
# Usage:
#   deploy/secrets.sh            # create secrets if missing (prompts for MONGO_DB_URI)
#   deploy/secrets.sh rotate     # add a new version of every secret
#
# Override defaults with env vars: PROJECT, REGION, SERVICE_ACCOUNT
set -euo pipefail

PROJECT="${PROJECT:-nacl-business-intelligence}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
MODE="${1:-create}"

gcloud services enable secretmanager.googleapis.com --project "$PROJECT"

# put_secret NAME VALUE — creates the secret if needed, then adds a version (value via stdin).
put_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$name" --project "$PROJECT" --replication-policy=automatic
  elif [ "$MODE" != "rotate" ]; then
    echo "Secret $name already exists — skipping (run with 'rotate' to add a new version)."
    return
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --project "$PROJECT" --data-file=-
  gcloud secrets add-iam-policy-binding "$name" --project "$PROJECT" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "Secret $name updated; accessible by $SERVICE_ACCOUNT"
}

# JWT signing key: freshly generated, 48 random bytes. Rotating it logs every user out.
put_secret jwt-secret "$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")"

# MongoDB connection string (contains credentials): read without echoing.
if [ "$MODE" = "rotate" ] || ! gcloud secrets describe mongo-db-uri --project "$PROJECT" >/dev/null 2>&1; then
  read -rsp "Production MONGO_DB_URI: " MONGO_URI; echo
  [ -n "$MONGO_URI" ] || { echo "MONGO_DB_URI is required" >&2; exit 1; }
  put_secret mongo-db-uri "$MONGO_URI"
fi
