# Private-beta deployment runbook

This runbook describes a provider-neutral M6 deployment. It does not select or provision a hosting vendor, PostgreSQL provider, S3-compatible provider, DNS name, or TLS proxy.

## Preconditions

Before exposing the private beta, provide:
- a PostgreSQL database reachable by both web and worker processes;
- a private S3-compatible bucket;
- one supported LLM provider credential for the worker;
- a TLS-terminating reverse proxy/load balancer in front of the web process;
- a random deployment-secret `API_IP_HASH_SALT` of at least 16 characters;
- a decision on trusted-proxy handling (`API_TRUST_PROXY` must stay `false` unless the proxy is controlled and strips untrusted forwarding headers).

The worker image does **not** contain the Factorio binary. At startup it runs the checksum-pinned `scripts/setup-factorio.sh` and downloads the official Factorio Headless 2.0.77 archive directly from Factorio. Mount a persistent volume at `/app/.tools` to avoid downloading it for every replacement container. Do not bake or redistribute the Factorio binary in the project image. Before paid/commercial automated validation, obtain explicit Wube clarification that this headless-server usage is permitted for the service.

## Build immutable application images

```bash
docker build -f infra/Dockerfile --target web -t <registry>/project-web:<git-sha> .
docker build -f infra/Dockerfile --target worker -t <registry>/project-worker:<git-sha> .
```

Both targets build TypeScript first and run the compiled production-import smoke. Runtime processes use `node --conditions=production` and package `dist/` outputs rather than `tsx`.

Local image reproducibility can be checked with:

```bash
pnpm test:container-images
```

The container test builds both targets, verifies that the worker image does not contain Factorio, checks the worker entrypoint against the pinned local runtime, applies compiled migrations to Docker PostgreSQL, and starts the compiled web image against Docker PostgreSQL + S3Mock.

## Keep web and worker secrets separate

Do not use one broad environment file for both processes in production when the platform supports per-service secrets.

Web needs:
- `DATABASE_URL`
- optional `PG_BOSS_SCHEMA`
- `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`
- S3 credentials able to authorize artifact reads/presigned downloads
- `API_IP_HASH_SALT`
- `API_TRUST_PROXY`
- optional `API_HOST`/`API_PORT` (image defaults: `0.0.0.0:3000`)

Worker needs:
- `DATABASE_URL`
- optional `PG_BOSS_SCHEMA`
- `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`
- S3 credentials able to upload artifacts
- LLM provider/model credential variables from `.env.example`
- optional worker heartbeat/recovery/concurrency variables
- `FACTORIO_BIN=/app/.tools/factorio/bin/x64/factorio` is already set by the worker image

The one-off S3 provider smoke additionally needs permission to `PutObject`, `GetObject`, and `DeleteObject` under the smoke prefix.

## Database migration

Back up the deployment database before applying a new migration. Apply migrations before starting a newer web/worker revision:

```bash
docker run --rm \
  --env-file <database-env-file> \
  <registry>/project-web:<git-sha> \
  node --conditions=production packages/service-postgres/dist/src/migrate-cli.js
```

Migrations are forward versioned Drizzle migrations. Do not replace this with schema push at application startup.

## Smoke the actual S3-compatible provider

Run this against the **hosted beta bucket**, not S3Mock, before deployment:

```bash
docker run --rm \
  --env-file <s3-smoke-env-file> \
  <registry>/project-web:<git-sha> \
  node --conditions=production packages/service-s3/dist/src/smoke-cli.js
```

The smoke uploads a small object under `smoke/`, creates a 60-second presigned GET, downloads and compares the bytes, then deletes the object. A successful local Docker/S3Mock test does not satisfy this hosted-provider gate.

## Provision beta users

Provision users only after migrations:

```bash
docker run --rm \
  --env-file <database-env-file> \
  <registry>/project-web:<git-sha> \
  node --conditions=production apps/web/dist/src/user-create-cli.js "Tester label"
```

The opaque token is printed once. Store/deliver it through an appropriate secret channel; PostgreSQL stores only its SHA-256 hash.

## Start web

Example with Docker:

```bash
docker run -d --name project-web \
  --restart unless-stopped \
  --env-file <web-env-file> \
  -p 127.0.0.1:3000:3000 \
  <registry>/project-web:<git-sha>
```

The reverse proxy should terminate HTTPS and forward only to this loopback/private listener. Liveness is:

```bash
curl -fsS http://127.0.0.1:3000/health/live
```

If `API_TRUST_PROXY=true`, configure it only behind the controlled proxy and ensure the proxy overwrites client forwarding headers.

## Start worker

Example with a persistent Factorio cache volume:

```bash
docker volume create project-factorio-tools

docker run -d --name project-worker \
  --restart unless-stopped \
  --env-file <worker-env-file> \
  -v project-factorio-tools:/app/.tools \
  <registry>/project-worker:<git-sha>
```

The entrypoint checksum-verifies the pinned Factorio archive. Generation jobs have automatic pg-boss retries disabled; retryable terminal failures require the explicit owner retry flow from ADR-0014.

Start with worker concurrency 1. Increase it only after observing Factorio CPU/memory usage and PostgreSQL/LLM/object-store behavior under beta load.

## Operational checks

After web and worker are running:
1. Verify `/health/live` through the public HTTPS route.
2. Create a dedicated smoke beta user and submit one supported request through the tester UI.
3. Confirm the generation reaches `succeeded`, download the ZIP, and install/test it in Factorio.
4. Verify feedback and willingness-to-pay survey writes.
5. Run the KPI report:

```bash
docker run --rm \
  --env-file <database-env-file> \
  <registry>/project-web:<git-sha> \
  node --conditions=production packages/service-postgres/dist/src/kpi-cli.js
```

The KPI report is observational. M6 is not complete merely because infrastructure is deployed; the live tester thresholds in `product-spec.md` still need real data.

## Upgrade and rollback

For an upgrade:
1. back up PostgreSQL;
2. build/tag immutable images from the target commit;
3. run hosted S3 smoke if storage configuration changed or has not yet been verified;
4. apply migrations once;
5. replace web;
6. replace worker;
7. run health + one end-to-end smoke.

If application rollback is needed, redeploy the previous immutable image only when its code is compatible with already-applied forward migrations. Do not blindly reverse database migrations containing live beta data. Stop worker processes before any manual database recovery.
