#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/compose.integration.yaml"

cleanup() {
  docker compose -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker compose -f "$compose_file" up -d --pull missing

postgres_ready=false
for _ in $(seq 1 120); do
  if docker compose -f "$compose_file" exec -T postgres pg_isready -U project -d modding_mvp >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 0.5
done
if [[ "$postgres_ready" != true ]]; then
  docker compose -f "$compose_file" ps >&2 || true
  docker compose -f "$compose_file" logs --tail=100 postgres >&2 || true
  echo "PostgreSQL integration service did not become ready" >&2
  exit 1
fi

s3_ready=false
for _ in $(seq 1 240); do
  if curl -sS --max-time 2 -o /dev/null http://127.0.0.1:59090/ 2>/dev/null; then
    s3_ready=true
    break
  fi
  sleep 0.5
done
if [[ "$s3_ready" != true ]]; then
  docker compose -f "$compose_file" ps >&2 || true
  docker compose -f "$compose_file" logs --tail=100 s3mock >&2 || true
  echo "S3Mock integration service did not become ready" >&2
  exit 1
fi

export PROJECT_SERVICE_POSTGRES_URL="postgresql://project:project-dev-password@127.0.0.1:55432/modding_mvp"
export PROJECT_SERVICE_S3_ENDPOINT="http://127.0.0.1:59090"
export PROJECT_SERVICE_S3_BUCKET="modding-artifacts"
export PROJECT_SERVICE_S3_ACCESS_KEY="project-dev-access"
export PROJECT_SERVICE_S3_SECRET_KEY="project-dev-secret"

cd "$repo_root"
"$@"
