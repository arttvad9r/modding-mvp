# ADR-0011: Private-beta generation uses an asynchronous API/worker boundary

Status: Accepted
Date: 2026-10-11

## Context
M5 proves the complete prompt-to-ZIP pipeline locally, but a private-beta HTTP request must not keep an API process occupied while an LLM call and real Factorio validation run. Generation can take seconds to minutes and may include bounded Repair. The beta also needs durable status, telemetry, feedback, retry-safe queue delivery, and artifact publication.

## Decision
Introduce `packages/service-core` as the transport/infrastructure-independent service boundary.

The API submission path will:
1. validate the prompt;
2. persist a `queued` generation record;
3. enqueue a versioned job containing only `generationId`;
4. return without running Planner, Factorio, or Repair inline.

A worker will:
1. load the generation by ID;
2. atomically claim `queued -> running` with monotonically increasing revision compare-and-set semantics;
3. execute the existing M5 generation pipeline through a `GenerationExecutor` port;
4. publish a successful ZIP through an `ArtifactStore` port;
5. persist exactly one terminal state: `succeeded`, `unsupported`, or `failed`.

Queue redelivery after a terminal state is a no-op. A second delivery while a generation is already `running` does not execute the pipeline again. The queue payload does not duplicate prompt, ModSpec, credentials, or artifact bytes; persisted generation state remains authoritative.

Service infrastructure is hidden behind three ports: `GenerationRepository`, `GenerationQueue`, and `ArtifactStore`. HTTP/API code and worker bootstrapping are adapters around these contracts.

## Alternatives considered
- Run M5 synchronously inside the HTTP request — rejected because long Factorio/LLM work couples API availability and client timeouts to generation duration.
- Put the whole prompt/ModSpec/result in the queue payload — rejected because it creates a second mutable source of truth and complicates retries/schema evolution.
- Let queue semantics alone prevent duplicate execution — rejected because at-least-once/redelivery behavior should remain safe at the application state boundary.

## Consequences
### Positive
- API latency is independent of Factorio runtime duration.
- Worker scaling can change without changing public API contracts.
- Generation state, telemetry, artifacts, and feedback have one durable service model.
- Duplicate terminal job delivery is idempotent.
- M5 local orchestration stays reusable instead of being rewritten inside web code.

### Negative / trade-offs
- Generation becomes eventually consistent from the API caller's perspective.
- Correct revision-based compare-and-set persistence is required.
- A separate worker process is required in deployment.
- Cancellation and stale-running recovery are not yet implemented and need explicit later policies.

## Revisit when
Reconsider if generation becomes reliably sub-second with no external runtime, or if observed beta traffic requires a different execution topology. Do not collapse API and worker processes merely to reduce deployment files.