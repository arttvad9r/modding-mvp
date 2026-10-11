# Private-beta service contract

This document describes the implemented M6 private-beta service boundary and the remaining transport/deployment constraints.

## Generation lifecycle

`queued -> running -> succeeded | unsupported | failed`

A generation is created before queue publication. Every record carries a monotonically increasing `revision`; repository updates use revision compare-and-set semantics so same-status updates such as feedback cannot silently overwrite each other. Workers claim only `queued` records. While execution is active, the worker refreshes `updatedAt` through revision CAS heartbeats. Terminal records are immutable except for bounded user feedback. Duplicate queue delivery after a terminal state is a no-op.

The queue message is versioned and contains only:

```json
{
  "schemaVersion": 1,
  "generationId": "<uuid>"
}
```

The persisted **generation record** is a separate versioned contract and is currently `schemaVersion: 2`; v2 adds immutable `userId` ownership. Queue jobs intentionally remain `schemaVersion: 1` because their payload contract is still only the generation ID. User records are separately versioned and currently use schema version 1.

The prompt, ModSpec, telemetry, errors, artifact metadata, and feedback stay in persistent generation state rather than being copied into queue payloads.

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

### `GET /v1/generations/:id`

Returns the current generation state. Terminal states expose either artifact metadata, an unsupported reason, or a normalized typed error.

### `POST /v1/generations/:id/feedback`

Request:

```json
{ "rating": "up", "note": "Installed and worked" }
```

Feedback is accepted only for terminal generations. Notes are bounded to 2,000 characters.

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
5. Refresh the running record with bounded revision-CAS heartbeats while execution is active.
6. Execute the M5 pipeline.
7. On success, validate the bounded ZIP filename/size, publish it first, verify returned artifact metadata matches the uploaded bytes/key, then persist `succeeded`.
8. Persist `unsupported` or typed `failed` outcomes without publishing an artifact.
9. Preserve Planner/Repair attempt metadata, usage/cost, validation metadata, and duration.
10. A separate recovery pass may mark a running record `failed` with retryable `process_error` only when its heartbeat is older than the configured stale threshold; CAS prevents racing a live worker.

Cancellation and explicit retry scheduling/requeue remain later M6 slices and must be added explicitly rather than inferred.

## Authentication and ownership
Private-beta users are operator-provisioned and authenticate with `Authorization: Bearer <opaque-token>`. Only a SHA-256 hash of the high-entropy token is stored. Each generation has an immutable `userId`; another user's generation ID resolves as not found rather than disclosing ownership. See ADR-0013.

API rate limits are backed by PostgreSQL fixed-window counters for both user ID and salted SHA-256 client-IP hash. `X-Forwarded-For` is used only when trusted-proxy mode is explicitly enabled.

## Implemented HTTP endpoints
- `GET /health/live` — unauthenticated liveness check.
- `POST /v1/generations` — authenticate, rate-limit, atomically persist+enqueue, return `202`.
- `GET /v1/generations/:id` — owner-scoped status/result; internal `userId` and object-store key are omitted.
- `POST /v1/generations/:id/feedback` — owner-scoped feedback for terminal results only.
- `GET /v1/generations/:id/download` — owner-scoped redirect to a 60-second presigned object URL only after success.

`apps/web` is currently an HTTP API process, not the final product UI. M6 may add a minimal tester interface over this stable service contract without moving generation work into the request process.
