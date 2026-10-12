FROM node:26.11.1-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.34.6

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN CI=true pnpm install --prod --frozen-lockfile

FROM node:26.11.1-bookworm-slim AS runtime-base
WORKDIR /app
COPY --from=build /app /app

FROM runtime-base AS web

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--conditions=production", "apps/web/dist/src/main.js"]

FROM runtime-base AS worker

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/.tools \
  && chown node:node /app/.tools \
  && chmod +x /app/infra/worker-entrypoint.sh

ENV NODE_ENV=production \
    FACTORIO_BIN=/app/.tools/factorio/bin/x64/factorio \
    WORKER_HEALTH_FILE=/tmp/worker-health \
    WORKER_HEALTH_MAX_AGE_S=180

USER node
STOPSIGNAL SIGTERM
# The worker touches WORKER_HEALTH_FILE after every successful recovery pass (WORKER_RECOVERY_INTERVAL_MS,
# default 60 s). The start period covers the first-run Factorio download (FACTORIO_INSTALL_TIMEOUT_S).
HEALTHCHECK --interval=30s --timeout=5s --start-period=16m --retries=3 \
  CMD node -e "const fs=require('fs');const t=Number(fs.readFileSync(process.env.WORKER_HEALTH_FILE,'utf8'));process.exit(Date.now()-t<Number(process.env.WORKER_HEALTH_MAX_AGE_S)*1000?0:1)"
ENTRYPOINT ["/app/infra/worker-entrypoint.sh"]
