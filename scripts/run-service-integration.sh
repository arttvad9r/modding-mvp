#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="$PROJECT_SERVICE_POSTGRES_URL" pnpm db:migrate
pnpm --filter @project/service-s3 test:service-integration
pnpm --filter @project/worker test:service-integration
pnpm --filter @project/web test:service-integration
