# ADR-0014: Private-beta generation retries are explicit new submissions

Status: Accepted
Date: 2026-10-11

## Context
A generation may fail for a retryable infrastructure reason even though its accepted prompt is still valid. Planner and Factorio work have real latency and cost, so silently retrying jobs can duplicate model spend, Factorio CPU, artifact publication attempts, and user-visible work. The service also treats terminal generation records as immutable lifecycle outcomes.

## Decision
Generation queue jobs do not retry automatically. The pg-boss generation queue and every generation send use `retryLimit: 0`.

A `failed` generation remains terminal. The service never changes an existing `failed`, `unsupported`, or `succeeded` record back to `queued`, and stale-running recovery continues to end in a retryable `failed` record rather than requeueing work.

An authenticated owner may explicitly retry only when the terminal record is `failed` and its typed error has `retryable: true`. `POST /v1/generations/:id/retry` creates a fresh generation ID with the same owner and prompt through the normal atomic persistence + queue submission path. The original failed record stays unchanged. Retry submissions consume the same create-rate-limit buckets as ordinary generation submissions.

Unsupported requests, successful generations, in-flight generations, and non-retryable failures cannot use the retry endpoint.

## Consequences
### Positive
- No hidden duplicate LLM or Factorio spend.
- Every execution attempt has one generation lifecycle and one immutable terminal result.
- Retry remains an explicit user action and passes through normal ownership, rate limits, and atomic queue submission.
- Stale-worker recovery cannot accidentally race a live worker by requeueing the same record.

### Negative / trade-offs
- Transient failures require an explicit retry instead of recovering invisibly.
- A retry is a separate generation ID; the v2 generation record does not persist a parent/retry lineage field.
- Product analytics must initially infer retries from the retry endpoint/event layer rather than a field on the generation record.

## Revisit when
Revisit after beta telemetry establishes transient failure frequency, retry success rate, and infrastructure/model cost. Automatic bounded retries may be introduced later only with a new explicit policy for attempt accounting, backoff, ownership, and duplicate artifact safety.
