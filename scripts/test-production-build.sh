#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

expect_missing_database_url() {
  local label="$1"
  shift
  local output
  local status
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  if [[ $status -eq 0 ]] || ! grep -Fq 'DATABASE_URL is required' <<<"$output"; then
    echo "$label production smoke failed" >&2
    echo "$output" >&2
    exit 1
  fi
}

expect_missing_database_url web node --conditions=production apps/web/dist/src/main.js
expect_missing_database_url worker node --conditions=production apps/worker/dist/src/main.js
expect_missing_database_url kpis node --conditions=production packages/service-postgres/dist/src/kpi-cli.js

set +e
s3_output=$(node --conditions=production packages/service-s3/dist/src/smoke-cli.js 2>&1)
s3_status=$?
set -e
if [[ $s3_status -eq 0 ]] || ! grep -Fq 'S3_BUCKET is required' <<<"$s3_output"; then
  echo "S3 smoke production import failed" >&2
  echo "$s3_output" >&2
  exit 1
fi

migrations=$(cd apps/web && node --conditions=production -e 'import("@project/service-postgres").then((m) => process.stdout.write(m.serviceMigrationsFolder()))')
[[ -d "$migrations" ]] || { echo "Production migration folder missing: $migrations" >&2; exit 1; }
[[ "$migrations" == "$repo_root/packages/service-postgres/drizzle" ]] || {
  echo "Unexpected production migration folder: $migrations" >&2
  exit 1
}

factorio_bin=$(cd packages/factorio-generator && node --conditions=production -e 'import("@project/factorio-harness").then((m) => process.stdout.write(m.defaultFactorioBinPath()))')
[[ "$factorio_bin" == "$repo_root/.tools/factorio/bin/x64/factorio" ]] || {
  echo "Unexpected production Factorio path: $factorio_bin" >&2
  exit 1
}

echo '{"status":"OK","productionBuildSmoke":true}'
