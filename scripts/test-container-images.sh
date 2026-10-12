#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

web_image="${PROJECT_WEB_IMAGE:-modding-mvp-web:test}"
worker_image="${PROJECT_WORKER_IMAGE:-modding-mvp-worker:test}"

docker image rm --force "$web_image" "$worker_image" >/dev/null 2>&1 || true

docker build -f infra/Dockerfile --target web -t "$web_image" .
docker build -f infra/Dockerfile --target worker -t "$worker_image" .

docker run --rm --entrypoint sh "$worker_image" -lc \
  'test ! -e /app/.tools/factorio/bin/x64/factorio'

# Exercise the image's own worker HEALTHCHECK command: fresh file healthy, stale or missing unhealthy.
worker_health="$(docker inspect --format '{{index .Config.Healthcheck.Test 1}}' "$worker_image")"
docker run --rm --entrypoint sh "$worker_image" -c \
  "node -e 'require(\"fs\").writeFileSync(process.env.WORKER_HEALTH_FILE, String(Date.now()))' && $worker_health"
if docker run --rm --entrypoint sh "$worker_image" -c \
  "node -e 'require(\"fs\").writeFileSync(process.env.WORKER_HEALTH_FILE, String(Date.now() - 600000))' && $worker_health"; then
  echo "Worker healthcheck accepted a stale health file" >&2
  exit 1
fi
if docker run --rm --entrypoint sh "$worker_image" -c "$worker_health" 2>/dev/null; then
  echo "Worker healthcheck accepted a missing health file" >&2
  exit 1
fi

bash scripts/setup-factorio.sh >/dev/null
set +e
worker_output=$(docker run --rm \
  -v "$repo_root/.tools:/app/.tools" \
  "$worker_image" 2>&1)
worker_status=$?
set -e
if [[ $worker_status -eq 0 ]] \
  || ! grep -Fq 'Factorio headless 2.0.77 is already installed.' <<<"$worker_output" \
  || ! grep -Fq 'DATABASE_URL is required' <<<"$worker_output"; then
  echo "Worker container smoke failed" >&2
  echo "$worker_output" >&2
  exit 1
fi

PROJECT_WEB_IMAGE="$web_image" bash scripts/with-service-infra.sh bash scripts/test-container-web.sh

echo '{"status":"OK","containerImages":true}'
