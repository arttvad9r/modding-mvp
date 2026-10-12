# Private-beta service contract

This document describes the implemented M6 private-beta service boundary and the remaining transport/deployment constraints.

## Generation lifecycle

`queued -> running -> succeeded | unsupported | failed`

A generation is created before queue publication. Every record carries a monotonically increasing `revision`; repository updates use revision compare-and-set semantics so same-status updates such as feedback cannot silently overwrite each other. Workers claim only `queued` records. While execution is active, the worker refreshes `updatedAt` through revision CAS heartbeats. Terminal records are immutable except for bounded user feedback and the first download-start timestamp. Duplicate queue delivery after a terminal state is a no-op.

The queue message is versioned and contains only:

```json
{
  "schemaVersion": 1,
  "generationId": "<uuid>"
}
```

The persisted **generation record** is a separate versioned contract and is currently `schemaVersion: 2`; v2 adds immutable `userId` ownership. Queue jobs intentionally remain `schemaVersion: 1` because their payload contract is still only the generation ID. User records are separately versioned and currently use schema version 1.

The prompt, ModSpec, telemetry, errors, artifact metadata, and feedback stay in persistent generation state rather than being copied into queue payloads. A follow-up revision generation may additionally carry `sourceGenerationId` and an internal `baseModSpec` snapshot; these fields are loaded by the worker from persistent state and are never copied into the queue job.

## Initial HTTP shape

### `POST /v1/generations`

Request:

```json
{ "prompt": "Make steel furnaces twice as fast" }
```

Expected behavior:
- validate prompt length/content;
- atomically persist status `queued` and enqueue the generation ID when using the PostgreSQL adapter;
- return `202 Accepted` with the generation record/ID;
- never run Planner, Factorio, or Repair in the request handler.

### `POST /v1/generations/:id/revise`

Request:

```json
{ "prompt": "Keep everything else, but make steel furnaces another 25% faster" }
```

Expected behavior:
- require ownership and a successful source generation;
- create a new queued generation rather than reopening the source;
- copy the source accepted ModSpec into internal `baseModSpec` and retain `sourceGenerationId`;
- enqueue only the new generation ID;
- Revision Planner returns the complete resulting typed bundle, after which the standard real-Factorio validation/artifact path runs again.

The public child record may expose `sourceGenerationId` for lineage but never exposes the duplicated internal `baseModSpec` snapshot.

### `GET /v1/generations?limit=10`

Returns up to 20 newest generations owned by the authenticated user, ordered newest-first. This is the tester recovery/history path used after reload; another user's generations are never returned.

### `GET /v1/generations/:id`

Returns the current generation state. Terminal states expose either artifact metadata, an unsupported reason, or a normalized typed error. Successful records expose the accepted ModSpec change list. Successful revision records additionally expose a derived `revisionDiff` (`added | removed | changed`) while the internal duplicated `baseModSpec` snapshot remains hidden.

### `POST /v1/generations/:id/feedback`

Request (new structured beta clients):

```json
{
  "intentMatch": "yes",
  "gameTest": "worked",
  "mainIssue": "other",
  "note": "Installed and worked"
}
```

`intentMatch` is `yes | partial | no`; `gameTest` is `worked | partly | failed | not_tested`; `mainIssue` is optional and bounded to a reviewed diagnostic category. Legacy `{ rating: "up" | "down", note? }` requests remain accepted. Structured feedback is normalized to the existing `rating` field for backwards-compatible KPI history. Feedback is accepted only for terminal generations. Notes are bounded to 2,000 characters.

### Artifact download

A successful generation stores a private object reference such as `generations/<generation-id>/<file>.zip`. The public API must authorize access and return/redirect to a short-lived download URL or stream the object. `packages/service-s3` implements 30–900 second presigned GetObject URLs; raw bucket credentials or permanently public object URLs are not part of the generation record.

## Service ports

`packages/service-core` defines infrastructure-neutral ports. `packages/service-postgres` implements the PostgreSQL repository/queue paths and provides an atomic submission store that joins Drizzle and pg-boss in one database transaction. `apps/worker` is the executable pg-boss consumer and `packages/service-s3` is the private object-store adapter:
- `GenerationRepository` — durable records plus revision-based compare-and-set updates;
- `GenerationQueue` — enqueue versioned generation jobs;
- `ArtifactStore` — publish validated ZIP bytes and return serializable object metadata;
- `GenerationExecutor` — worker-side adapter to the existing M5 Planner/Factorio/Repair pipeline.

## Worker rules

1. Load the generation by job ID.
2. If terminal, acknowledge/no-op.
3. If already running, do not execute it again.
4. Atomically claim `queued -> running`.
5. Refresh the running record with bounded revision-CAS heartbeats from claim until publication has finished. The heartbeat stops by itself after `execution + publication + 60 s grace`, so a stuck worker becomes eligible for stale recovery instead of renewing its claim forever.
6. Execute the M5 pipeline under the execution deadline (`WORKER_EXECUTION_TIMEOUT_MS`, default 600 s). On expiry the worker aborts one `AbortSignal` that reaches every LLM request and Factorio process; the result is a retryable `process_error`.
7. On success, validate the bounded ZIP filename/size and publish it under the publication deadline (`WORKER_PUBLISH_TIMEOUT_MS`, default 120 s; the upload is aborted on expiry), verify returned artifact metadata matches the uploaded bytes/key, then persist `succeeded` with `finishedAt` taken after publication.
8. If the claim was lost during execution/publication, the heartbeat failed, or the terminal CAS does not land, the just-published object is deleted best-effort so no orphaned ZIP outlives its record.
9. Persist `unsupported` or typed `failed` outcomes without publishing an artifact.
10. Preserve Planner/Repair attempt metadata, usage/cost, validation metadata, and duration.
11. A separate recovery pass may mark a running record `failed` with retryable `process_error` only when its heartbeat is older than the configured stale threshold; CAS prevents racing a live worker.
12. The same recovery pass reconciles orphaned `queued` records older than `WORKER_ORPHAN_QUEUED_AFTER_MS` (default 60 s): it asks pg-boss for the generation's job state and, only when no job can still start it (`missing` or `finished`), marks the record `failed` with retryable `process_error` and `details.jobState`. `pending`/`active` jobs are left alone; CAS prevents racing a worker claim.

Execution + publication deadlines + the 60 s heartbeat grace must stay below the pg-boss job expiry (900 s); the worker refuses to start otherwise. Each LLM call is additionally bounded by `LLM_REQUEST_TIMEOUT_MS` (default 120 s, covering headers and body) and a 4 MB response cap; a timed-out call may fail over to the fallback provider, a deadline cancellation never does. User-initiated cancellation remains deferred. Retry behavior is explicit: generation jobs have no automatic pg-boss retries, terminal records are never reopened, and a retryable failure may be retried only by creating a new generation through the owner-scoped retry endpoint; see ADR-0014.

## Authentication and ownership
Private-beta users are operator-provisioned and authenticate with `Authorization: Bearer <opaque-token>`. Only a SHA-256 hash of the high-entropy token is stored. User records also carry `metricsEligible`; normal tester provisioning defaults it to `true`, while explicit internal/smoke accounts set it to `false` without changing authentication or ownership behavior. Each generation has an immutable `userId`; another user's generation ID resolves as not found rather than disclosing ownership. See ADR-0013.

API rate limits are backed by PostgreSQL fixed-window counters for both user ID and salted SHA-256 client-IP hash. `X-Forwarded-For` is used only when trusted-proxy mode is explicitly enabled.

Default policy (`DEFAULT_API_RATE_LIMIT_POLICY` in `apps/web`):

| Bucket | Limit | Window |
|---|---|---|
| pre-auth request budget per IP | 1,800 | 1 min |
| failed bearer-token attempts per IP (successful requests never consume it) | 30 | 1 min |
| create/revise/retry per user / per IP | 10 / 30 | 1 h |
| reads (status, history) per user / per IP | 300 / 1,200 | 1 min |
| feedback per user / per IP | 30 / 100 | 1 h |
| downloads per user / per IP | 120 / 300 | 1 h |
| willingness-to-pay survey per user / per IP | 20 / 100 | 1 h |

The pre-auth IP budget is deliberately larger than every route budget behind it, so normal polling from several testers behind one NAT is limited by the per-route buckets rather than by authentication. The web process deletes buckets untouched for 24 h (the maximum accepted window) in bounded batches of 1,000 rows, at most 20 batches per run, every `RATE_LIMIT_CLEANUP_INTERVAL_MS` (default 15 min); runs that delete rows log `rate_limit_cleanup` with the deleted count and the planner's table-size estimate.

## Implemented HTTP endpoints
- `GET /health/live` — unauthenticated liveness check.
- `POST /v1/generations` — authenticate, rate-limit, atomically persist+enqueue, return `202`.
- `GET /v1/generations?limit=1..20` — owner-scoped newest-first recent-generation history.
- `GET /v1/generations/:id` — owner-scoped status/result; internal `userId`, `baseModSpec`, and object-store key are omitted; successful revisions may include a derived public diff.
- `POST /v1/generations/:id/revise` — owner-scoped successful-generation follow-up; creates a new immutable child generation from the accepted ModSpec snapshot.
- `POST /v1/generations/:id/feedback` — owner-scoped feedback for terminal results only.
- `POST /v1/generations/:id/retry` — only for owner-scoped `failed` records whose typed error is retryable; creates a new queued generation with the same prompt and leaves the original terminal record unchanged. Retrying a failed revision preserves its `sourceGenerationId` and internal `baseModSpec`, so the retry runs the Revision Planner against the same accepted snapshot rather than becoming a fresh unrelated request.
- `GET /v1/generations/:id/download` — owner-scoped 60-second presigned object URL only after success; the first authorized download request records `firstDownloadedAt` once as a funnel signal (it means download started/requested, not proof of installation). Default clients receive a `302`; clients sending `Accept: application/json` receive `{ downloadUrl, expiresInSeconds }`, which lets the same-origin tester UI navigate to object storage without forwarding the bearer token.
- `POST /v1/survey` — authenticated per-user upsert of `{ willingnessToPay: "yes" | "maybe" | "no" }` for the private-beta willingness-to-pay hypothesis.

## Tester UI
`GET /` serves the private-beta tester interface from the same `apps/web` process. The interface is bilingual English/Russian, selects Russian automatically for a Russian browser locale, exposes an explicit EN/RU switch, and stores only the non-secret language preference in `localStorage`; the beta bearer token remains only in tab-scoped `sessionStorage`. The page uses a three-step onboarding flow, explains the intentionally narrow prototype-stage beta scope and isolated base-game Factorio 2.0.77 validation boundary, offers language-matched known-good example prompts, loads the authenticated user's recent generations, submits prompts through the API, polls until terminal state, renders localized accepted typed changes plus a revision diff when applicable, explains unsupported/retryable outcomes, exposes the signed ZIP download on success, offers a natural-language follow-up form, records short structured intent/in-game feedback plus an optional issue/note, and asks the explicit willingness-to-pay survey after success. Russian broad-category wording is covered by the same conservative no-partial-fulfillment guard as English wording. Static UI routes remain separate from authenticated generation routes and use restrictive CSP/no-store headers.

## Beta KPI report
`pnpm beta:kpis` reads the deployment PostgreSQL database, excludes users with `metricsEligible=false` and all of their generations/surveys, and emits one JSON report covering active/provisioned testers, distinct-prompt repeat usage, supported terminal success, direct success without Repair, latency medians, Factorio-validation median, download-start conversion, feedback coverage, intent-match counts, in-game test coverage/worked/runtime-failure signals, a structured problem-outcome rate (intent mismatch or partly/failed in-game result), the legacy reported false-success proxy, willingness to pay, token/cost coverage, and Repair attempts. The report is observational; it does not mark M6 hypotheses as achieved until real beta data reaches their thresholds.

Latency medians are computed over terminal records only:
- `medianPromptToResultMs` — wall clock `finishedAt - createdAt` across all terminal outcomes; `finishedAt` is recorded after artifact publication, so it includes queue wait, execution, upload, and persistence;
- `medianSucceededPromptToResultMs` — the same interval for `succeeded` only, the population behind the product-spec "prompt-to-result <= 3 minutes" hypothesis; fast unsupported/failed outcomes cannot mask ZIP latency;
- `medianQueueWaitMs` — `startedAt - createdAt` for records a worker claimed;
- `medianExecutionMs` — executor pipeline duration from telemetry (Planner, generation, Factorio, Repair), excluding queue wait and publication.
