#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @project/service-s3 test:service-integration
pnpm --filter @project/worker test:service-integration
