#!/usr/bin/env bash
# Build and deploy to Cloud Run. Secrets are injected from Secret Manager
# (run deploy/secrets.sh once first); plain config is set as env vars.
#
# Override defaults with env vars: PROJECT, REGION, SERVICE, GCS_BUCKET, MONGO_DB_NAME, SERVICE_ACCOUNT
set -euo pipefail

PROJECT="${PROJECT:-nacl-business-intelligence}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-budget-intelligence}"
GCS_BUCKET="${GCS_BUCKET:-nacl-budget-intelligence-pdfs}"
MONGO_DB_NAME="${MONGO_DB_NAME:-nacl-buget-intelligence}"

cd "$(dirname "$0")/.."

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  ${SERVICE_ACCOUNT:+--service-account "$SERVICE_ACCOUNT"} \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},GCS_BUCKET=${GCS_BUCKET},MONGO_DB_NAME=${MONGO_DB_NAME}" \
  --set-secrets "JWT_SECRET=jwt-secret:latest,MONGO_DB_URI=mongo-db-uri:latest"
