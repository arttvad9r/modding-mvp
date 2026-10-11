# Architecture v0.12

## Current state
M0 is complete: `packages/factorio-harness` validates a candidate mod against pinned Factorio headless 2.0.77 in an isolated temporary environment and returns structured PASS/FAIL.

M1 through M5 are complete and the M6 private-beta service foundation is operational. M6A is now the active product-value gate before public recruitment. The deterministic core still has four reviewed primitive capability families, but a backward-compatible `mixed` ModSpec can compose those primitives into one tweak bundle. The generator dispatches each typed change independently, while semantic assertions and real Factorio 2.0.77 remain authoritative. The reviewed prototype-property catalog now includes speed parameters for furnaces, assembling machines, mining drills, transport belts, inserters, and labs. The service, PostgreSQL/pg-boss queue, object storage, auth/rate limits, tester UI, hosted deployment, and KPI instrumentation remain in place; public off-tailnet ingress and 30+ tester recruitment are deferred until the M6A product-value gate is satisfied.

## Target product pipeline

`prompt -> Planner -> ModSpec -> Generator -> static validation -> Factorio tester -> bounded Repair -> ZIP`

The pipeline intentionally separates natural-language interpretation from code generation and real-runtime validation.

## Current implemented boundary: factorio-harness
Input:
- path to a local Factorio mod directory;
- path to a Factorio headless binary;
- optional timeout.

Output:
- `ok: true` when Factorio loads the mod and successfully creates a test map;
- otherwise `ok: false` with exit code, normalized error summary, and bounded logs.

Every run creates a fresh temporary directory containing a dedicated `mods/` directory, generated `mod-list.json`, and temporary output save. The supplied source mod is copied and never mutated.

See ADR-0003 for why real Factorio is the validation authority.

## Implemented deterministic artifact boundary
The current deterministic core provides:
- `packages/domain` for typed ModSpec, generated-file manifest, and shared `ProjectError` contracts;
- `packages/factorio-knowledge` for versioned Factorio allow-lists/baselines plus machine-readable Planner capability metadata;
- `packages/factorio-generator` for deterministic supported ModSpec-to-Lua generation across prototype property, recipe ingredient, technology cost, and reviewed technology prerequisite changes, including composition of those primitives in a `mixed` ModSpec;
- semantic assertion Lua generated separately from the user artifact;
- `packages/factorio-harness` temporary companion validator mod and structured semantic failure classification;
- temporary-only manifest materialization;
- allow-listed Factorio artifact packaging with only `info.json` and `data.lua`;
- `pnpm mod:build -- <spec.json> [output-dir]` for ModSpec -> validation -> installable ZIP.

No LLM is required for the deterministic core. Generator correctness and the Factorio contract are established independently before natural-language planning is introduced.


## Implemented Planner boundary
- `packages/llm` defines a provider-agnostic `generateJson` contract and usage metadata.
- `packages/llm` provides OpenAI Responses and reusable OpenAI-compatible Chat Completions transports without leaking provider HTTP shapes into orchestration.
- `packages/agent-core` builds Planner scope from `factorioCapabilityRegistry`.
- The LLM returns only supported/unsupported plus title/slug and typed changes; multiple primitive families may be returned in one supported decision.
- The application derives the single-family or `mixed` root marker, fixed target metadata, and semantic assertions deterministically before `ModSpecSchema` validation.
- Unsupported/invented registry targets are rejected before deterministic generation.
- Planner structured-output correction is bounded to two attempts by default.
- `evals/planner/golden.json` and `pnpm planner:eval` provide repeatable model evaluation.
- For Ollama reasoning models used as JSON planners, the adapter can request `reasoning_effort: none`; this avoids reasoning/content splits while application-side Zod validation remains authoritative.
- The original M3 live baselines reached 100% classification and supported ModSpec accuracy on the 24-case corpus with Ollama Cloud `deepseek-v4.1-flash:cloud` and Z.ai Coding Plan `glm-5.3-flash`; after the M6A mixed/assembler expansion, Z.ai `glm-5.3-flash` again passed 24/24 classification and 14/14 exact supported ModSpecs on the updated corpus.

## Implemented Repair boundary
- `packages/agent-core` accepts the original immutable ModSpec, previous bounded manifest, normalized runtime error, provider, and candidate validator.
- Only `factorio_load_failed` and `semantic_assertion_failed` are eligible for model Repair.
- Model output is exactly a replacement `data.lua`; `info.json`, file paths/roles, ModSpec, and semantic assertions remain application-owned.
- Repair has a hard two-attempt cap and records attempt outcome, provider/model, usage/cost metadata, duration, error, and terminal reason.
- `packages/factorio-generator` exposes real-Factorio validation for an arbitrary bounded generated manifest while reusing its original semantic assertions.
- `evals/repair/golden.json` plus `pnpm repair:eval` exercise injected failures through Repair and real Factorio.
- Z.ai Coding Plan `glm-5.3-flash` also repairs 5/5 golden cases with 5 total attempts.

## Implemented local end-to-end boundary
- `runLocalFactorioGeneration` composes Planner, deterministic generation, real Factorio validation, bounded Repair, and ZIP packaging without weakening any lower-level boundary.
- `pnpm prompt:build -- "<request>"` is the local user-facing command. Progress events are bounded structured records on stderr; stdout contains one terminal JSON result.
- Success returns a ZIP path only after real Factorio plus semantic assertions pass. Unsupported requests and typed failures do not produce an artifact.
- Planner and Repair attempt metadata, aggregate token/cost metadata, validation timing, progress history, ModSpec, and terminal status are persisted to git-ignored `.runs/<generation-id>.json`.
- `pnpm prompt:feedback -- <generation-id> <up|down> [note]` updates the matching local run report. This JSON persistence is a disposable M5 prototype, not the M6 service data model.
- Recorded live smoke on Z.ai Coding Plan `glm-5.3-flash`: direct supported request completed in about 5.4 seconds with one Planner attempt, 2,215 model tokens, 1.54 seconds of Factorio validation, and a validated ZIP under root `dist/`.
- M6A mixed smoke: one natural-language four-change rebalance produced a `mixed` ModSpec on the first attempt and a real-Factorio-validated ZIP in about 8.1 seconds with no Repair.


## Implemented private-beta service core boundary
- `packages/service-core` owns transport/infrastructure-neutral generation records, jobs, telemetry, artifact references, feedback, and lifecycle schemas.
- Lifecycle is `queued -> running -> succeeded | unsupported | failed`.
- API submission persists `queued` state and publishes a versioned queue message containing only `generationId`; the API must not run Planner, Factorio, or Repair inline.
- Workers use a monotonically increasing `revision` for compare-and-set claiming/updates; duplicate delivery after a terminal state is a no-op and already-running work is not executed twice. Active jobs refresh revision/`updatedAt` heartbeats, and a CAS-safe recovery pass converts genuinely stale running records into retryable process failures.
- `GenerationRepository`, `GenerationQueue`, `ArtifactStore`, and `GenerationExecutor` are ports. Future HTTP/PostgreSQL/pg-boss/S3 implementations are adapters around them.
- `packages/factorio-service-executor` implements `GenerationExecutor` by running the proven M5 pipeline in an isolated temporary root, mapping telemetry to service schemas, reading only the validated ZIP bytes, and deleting temporary reports/artifacts afterward.
- Successful workers publish the validated ZIP through `ArtifactStore` before persisting `succeeded`; unsupported/failed outcomes do not publish artifacts.
- `packages/service-postgres` implements a Drizzle/node-postgres repository, versioned migration, pg-boss queue, and transactional `generation row + job` submission using pg-boss `fromDrizzle`.
- The adapter integration test boots a checksum-pinned user-space PostgreSQL 18.6 server, applies migrations, exercises revision CAS, round-trips pg-boss jobs, and proves enqueue failure rolls back the generation row.
- `packages/service-s3` implements `ArtifactStore` with AWS SDK v3 PutObject plus short-lived presigned GetObject URLs; permanent public URLs are not persisted. Both a protocol-level test and Docker S3-compatible server test exercise upload/download bytes; the selected beta provider, SeaweedFS 4.39 on the Helsinki VPS, has also passed the hosted upload/presigned-download/delete smoke.
- `apps/worker` registers a bounded-concurrency pg-boss consumer, invokes `processGenerationJob`, refreshes running-generation heartbeats, periodically recovers stale running records, and wires production env configuration to Postgres/S3/LLM/Factorio adapters.
- Generation jobs have `retryLimit: 0`. Retryable terminal failures are retried only by explicit owner action, which creates a fresh generation through the normal atomic submission path; terminal records are never reopened. See ADR-0014.
- `infra/compose.integration.yaml` plus `pnpm test:service-integration` prove the full infrastructure path with Docker PostgreSQL and S3Mock while using real Factorio and a fake typed Planner provider.
- `apps/web` exposes the private-beta HTTP API with opaque bearer authentication, owner-scoped generation access, PostgreSQL-backed user/IP rate limiting, terminal feedback, and short-lived signed artifact downloads. The API never runs Planner/Factorio synchronously.
- The same process serves a dependency-free tester UI at `/`. It keeps the beta token in tab-scoped `sessionStorage`, submits prompts asynchronously, polls generation state, obtains signed download URLs through the authenticated API, and records feedback.
- `beta_survey_responses` stores one explicit `yes | maybe | no` willingness-to-pay answer per tester. `pnpm beta:kpis` computes the private-beta hypothesis report from service users, generation records, feedback, telemetry, and survey responses without a second analytics datastore.
- Workspace packages use a `production` export condition for compiled `dist` entrypoints while development/tests keep source entrypoints. `pnpm build` runs a compiled-runtime smoke so successful TypeScript compilation is not mistaken for deployable Node resolution. `infra/Dockerfile` provides separate web/worker targets; the worker downloads the official checksum-pinned Factorio headless archive at runtime instead of embedding it in the image.
- `service_users` stores only SHA-256 hashes of high-entropy beta tokens; generation rows carry immutable `userId`. Raw client IPs are salted+hashed before rate-limit keys are persisted. See ADR-0013.
- ADR-0011 defines the asynchronous service boundary. ADR-0012 selects PostgreSQL + Drizzle/node-postgres + pg-boss and private S3-compatible object storage for the private-beta adapters.

## Package/application boundaries
- `packages/domain`: ModSpec, generation states, shared typed errors.
- `packages/factorio-harness`: executes and normalizes Factorio validation.
- `packages/factorio-generator`: deterministic Factorio artifact generation.
- `packages/factorio-knowledge`: versioned Factorio support targets/baselines and Planner-facing capability registry.
- `packages/llm`: model provider abstraction plus OpenAI Responses and OpenAI-compatible Chat Completions transports/presets.
- `packages/agent-core`: Planner/Repair orchestration.
- `packages/service-core`: private-beta generation state machine and service ports.
- `packages/factorio-service-executor`: Factorio/M5 implementation of the service executor port.
- `packages/service-postgres`: PostgreSQL/Drizzle persistence plus pg-boss queue adapter.
- `packages/service-s3`: private S3-compatible artifact upload and presigned download adapter.
- `apps/worker`: asynchronous generation job consumer.
- `apps/web`: private-beta UI/API.

## Architecture invariants
- Factorio-specific behavior stays behind Factorio package boundaries.
- ModSpec is the typed intent boundary; see ADR-0004.
- Generated files are materialized from a bounded manifest, not by granting an LLM shell access.
- Real Factorio validation cannot be replaced by a static-only success claim.
- External execution is isolated, timed out, and bounded.
- Initial capability scope remains prototype-stage only; see ADR-0005.

Detailed requirements live in `technical-spec.md`; durable rationale lives in `docs/adr/`.
