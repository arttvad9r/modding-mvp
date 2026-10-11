#!/usr/bin/env bash
set -euo pipefail

cd /app
bash scripts/setup-factorio.sh
exec node --conditions=production apps/worker/dist/src/main.js
