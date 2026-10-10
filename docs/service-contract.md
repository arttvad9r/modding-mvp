# Private-beta service contract

This document describes the M6 service boundary. It is transport-facing design, not a promise that every endpoint is already implemented.

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

`packages/service-core` defines infrastructure-neutral ports. `packages/service-postgres` implements the PostgreSQL repository/queue paths and provides an atomic submission store that joins Drizzle and pg-boss in one database transaction:
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

Cancellation, explicit retry scheduling/requeue, authentication, and rate limiting are later M6 slices and must be added explicitly rather than inferred.