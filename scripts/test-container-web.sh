#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_SERVICE_POSTGRES_URL:?PROJECT_SERVICE_POSTGRES_URL is required}"
: "${PROJECT_SERVICE_S3_ENDPOINT:?PROJECT_SERVICE_S3_ENDPOINT is required}"
: "${PROJECT_SERVICE_S3_BUCKET:?PROJECT_SERVICE_S3_BUCKET is required}"
: "${PROJECT_SERVICE_S3_ACCESS_KEY:?PROJECT_SERVICE_S3_ACCESS_KEY is required}"
: "${PROJECT_SERVICE_S3_SECRET_KEY:?PROJECT_SERVICE_S3_SECRET_KEY is required}"

image="${PROJECT_WEB_IMAGE:-modding-mvp-web:test}"
name="modding-mvp-web-container-smoke"
port="${PROJECT_CONTAINER_API_PORT:-33000}"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

docker run --rm --network host \
  -e DATABASE_URL="$PROJECT_SERVICE_POSTGRES_URL" \
  "$image" \
  node --conditions=production packages/service-postgres/dist/src/migrate-cli.js >/dev/null

docker run -d --rm --name "$name" --network host \
  -e DATABASE_URL="$PROJECT_SERVICE_POSTGRES_URL" \
  -e S3_ENDPOINT="$PROJECT_SERVICE_S3_ENDPOINT" \
  -e S3_BUCKET="$PROJECT_SERVICE_S3_BUCKET" \
  -e S3_REGION=us-east-1 \
  -e S3_ACCESS_KEY_ID="$PROJECT_SERVICE_S3_ACCESS_KEY" \
  -e S3_SECRET_ACCESS_KEY="$PROJECT_SERVICE_S3_SECRET_KEY" \
  -e S3_FORCE_PATH_STYLE=true \
  -e API_IP_HASH_SALT=container-smoke-ip-salt-1234567890 \
  -e API_HOST=127.0.0.1 \
  -e API_PORT="$port" \
  "$image" >/dev/null

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${port}/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

curl -fsS "http://127.0.0.1:${port}/health/live" >/dev/null
# Assert stable DOM/route invariants rather than marketing copy, which changes with the UI.
page="$(curl -fsS "http://127.0.0.1:${port}/")"
grep -Fq 'id="generation-form"' <<<"$page"
grep -Fq 'src="/app.js"' <<<"$page"
script="$(curl -fsS "http://127.0.0.1:${port}/app.js")"
grep -Fq '/v1/generations' <<<"$script"
# A malformed request-target must be answered with 400 without taking the process down.
status="$(curl -sS -o /dev/null -w '%{http_code}' --request-target '//[' "http://127.0.0.1:${port}/")"
test "$status" = "400"
curl -fsS "http://127.0.0.1:${port}/health/live" >/dev/null
echo '{"status":"OK","containerWebSmoke":true}'
