FROM node:26.11.1-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.34.6

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM build AS web

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--conditions=production", "apps/web/dist/src/main.js"]

FROM build AS worker

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/.tools \
  && chown node:node /app/.tools \
  && chmod +x /app/infra/worker-entrypoint.sh

ENV NODE_ENV=production \
    FACTORIO_BIN=/app/.tools/factorio/bin/x64/factorio

USER node
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/infra/worker-entrypoint.sh"]
