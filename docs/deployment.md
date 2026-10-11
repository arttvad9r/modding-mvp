# Private-beta deployment runbook

This runbook describes the provider-neutral M6 deployment contract plus the first concrete beta topology.

## First deployed beta topology (2026-10-11)

The initial production-like environment runs on the Helsinki Debian VPS using `infra/compose.beta.yaml` and a `0600` env file stored outside the repository. It deliberately keeps application and storage listeners on loopback; ingress is a separate concern.

Pinned infrastructure:
- PostgreSQL `18.6-alpine3.24` at digest `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873`;
- SeaweedFS 4.39 at digest `sha256:c7d6c721b30ae711db766bbbfd40192776e263d4e51e22f57baef7bef93c12c6`, running `weed mini` with a persistent `/data` volume;
- application web/worker images built from runtime revision `fc00697` (production-only dependency layer);
- persistent volumes for PostgreSQL, object storage, and `/app/.tools` Factorio runtime cache;
- fixed compose subnet `172.30.0.0/24`; worker concurrency starts at `1`.

PostgreSQL 18+ must mount the volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data`. The official image rejects the old mount layout.

The VPS has a default-drop host forward chain. Docker therefore also needs narrow forwarding permission for the compose subnet. Persist equivalent rules in the host policy, adapting the public interface name if it is not `ens1`:

```nft
ct state established,related accept
ip saddr 172.30.0.0/24 ip daddr 172.30.0.0/24 accept
ip saddr 172.30.0.0/24 oifname "ens1" accept
```

Validate the checked-in topology before transferring it to the VPS:

```bash
pnpm test:beta-compose
```

Start/reconcile the stack with:

```bash
docker compose --env-file /opt/modding-mvp/beta.env \
  -f /opt/modding-mvp/compose.beta.yaml up -d
```

Current private HTTPS ingress is Tailscale Serve:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
tailscale serve --bg --tls-terminated-tcp=8443 tcp://127.0.0.1:8333
```

Web is therefore available only inside the tailnet at `https://helsinki-vps.<tailnet>.ts.net/`, and presigned S3 URLs use the same host on port `8443`. `API_TRUST_PROXY=true` is acceptable for this topology because the web container is published only on loopback behind the controlled Serve proxy; a live spoof check confirmed that a client-supplied `X-Forwarded-For` did not replace the real tailnet client IP used by rate limiting.

Tailscale Funnel is not yet enabled for the tailnet and requires one tailnet-admin approval. Once enabled, the same two listeners can be switched from `tailscale serve` to `tailscale funnel`, or replaced by a conventional public DNS/TLS reverse proxy. Do not recruit off-tailnet testers until this ingress gate is complete.

Deployment evidence from 2026-10-11:
- hosted SeaweedFS smoke passed upload -> presigned GET -> byte comparison -> delete;
- the deployed worker reported `zai` / `glm-5.3-flash`;
- the first server generation succeeded directly without Repair in 19,074 ms using 2,205 tokens; Factorio validation took 11,249 ms;
- the ZIP downloaded through the HTTPS presigned endpoint and passed archive validation;
- feedback and willingness-to-pay survey writes succeeded;
- runtime images were upgraded to `fc00697`: web 528 MB and worker 551 MB locally versus 758/781 MB before slimming, then both restarted successfully on the VPS with the Factorio cache preserved.

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

# Operator/deployment smoke account; authenticates normally but is excluded from beta KPI reporting.
docker run --rm \
  --env-file <database-env-file> \
  <registry>/project-web:<git-sha> \
  node --conditions=production apps/web/dist/src/user-create-cli.js --internal "Deployment smoke"
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
2. Create a dedicated `--internal` smoke user and submit one supported request through the tester UI. Internal users authenticate normally but their generations/surveys are excluded from product KPI reporting.
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
