# Engineering backlog

This file tracks milestone-level tasks suitable for human or AI-agent execution. Each task should normally map to one small PR/commit and satisfy `AGENTS.md`.

## M0 — complete
- [x] Initialize TypeScript/pnpm monorepo.
- [x] Add repository agent rules.
- [x] Pin/install Factorio headless 2.0.77 reproducibly.
- [x] Implement isolated Factorio harness.
- [x] Normalize PASS/FAIL output.
- [x] Add valid and invalid fixture mods.
- [x] Add real Factorio integration tests.

## M1 — complete

### Domain contract
- [x] Create `packages/domain`.
- [x] Define `GameTarget` with Factorio stable 2.0 target policy.
- [x] Define `ModSpec` root schema.
- [x] Define `prototype_property` change schema.
- [x] Define `set` and `multiply` operations.
- [x] Define semantic assertion schema.
- [x] Add schema unit tests for valid and invalid examples.

### Factorio generator
- [x] Create `packages/factorio-generator`.
- [x] Generate deterministic mod slug/name/version metadata.
- [x] Generate `info.json` from a ModSpec.
- [x] Generate safe `data.lua` for one scalar prototype mutation.
- [x] Escape/validate all Lua string inputs rather than concatenating unchecked values.
- [x] Add allow-list for initially supported prototype/property pairs.
- [x] Add deterministic generator snapshot/golden tests.

### Semantic validation
- [x] Design a semantic assertion mechanism for data-stage prototype state.
- [x] Generate an assertion from `prototype_property` ModSpec.
- [x] Integrate assertion failure into structured harness result.
- [x] Add fixture proving load-success but semantic-failure is detected.

### Packaging and command flow
- [x] Add safe generated file manifest contract.
- [x] Materialize manifest only under a temporary build directory.
- [x] Package installable Factorio ZIP with correct top-level folder.
- [x] Add a local command for `ModSpec JSON -> validated ZIP`.
- [x] Add end-to-end deterministic integration tests.

## M1 exit review
Before starting M2:
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:integration`.
- [x] Run `pnpm build`.
- [x] Review package boundaries against `technical-spec.md`.
- [x] Add/update ADRs for any architecture decision made during M1.
- [x] Confirm at least five ModSpec fixtures pass through the real Factorio runtime.

## M2 — complete

### Recipe ingredient capability
- [x] Add `recipe_ingredient` ModSpec capability.
- [x] Support existing base-game item ingredients only.
- [x] Support `set` and `multiply` amount operations.
- [x] Reject invalid item amounts before Factorio execution.
- [x] Add versioned allow-list/baselines for initial recipes.
- [x] Generate deterministic recipe mutation Lua.
- [x] Generate semantic recipe ingredient assertions.
- [x] Pass at least five recipe fixtures through real Factorio and ZIP packaging.

### Technology cost capability
- [x] Add `technology_cost` ModSpec capability.
- [x] Support `set` and `multiply` for finite `unit.count` technologies.
- [x] Add Factorio 2.0.77 baselines for initial allow-listed technologies.
- [x] Reject non-positive and non-integer final research counts before Factorio execution.
- [x] Generate deterministic technology cost mutation Lua.
- [x] Generate semantic technology cost assertions.
- [x] Pass five technology fixtures through real Factorio and ZIP packaging.

### Capability discovery
- [x] Create `packages/factorio-knowledge` as the support-knowledge boundary.
- [x] Move deterministic allow-lists/baselines out of the generator package.
- [x] Add machine-readable capability metadata for Planner discovery.
- [x] Derive registry targets from the same allow-lists used by generation.
- [x] Add ADR-0007 for registry-driven Planner scope.

### Technology prerequisite capability
- [x] Add `technology_prerequisite` ModSpec capability.
- [x] Restrict add/remove operations to reviewed baseline-aware edges.
- [x] Generate deterministic prerequisite mutation Lua and semantic assertions.
- [x] Pass five prerequisite fixtures through real Factorio and ZIP packaging.

### Error taxonomy
- [x] Add shared `ProjectError` contract in `packages/domain`.
- [x] Distinguish input/schema/unsupported/generation/packaging/runtime/semantic/process errors.
- [x] Preserve typed errors across package boundaries.
- [x] Serialize structured CLI errors without exposing stack/cause.
- [x] Add ADR-0008 for the cross-pipeline error contract.

## M2 exit review
- [x] Four deterministic capability families implemented.
- [x] Machine-readable Planner capability registry implemented.
- [x] Deterministic corpus contains 20 real Factorio E2E fixtures.
- [x] No generated-code path has arbitrary shell access.
- [x] Errors distinguish schema, unsupported scope, generation, packaging, Factorio load, semantic assertion, and process failures.
- [x] Repository typecheck, unit tests, integration tests, build, and diff checks pass.
- [x] ADRs/specs updated for durable M2 decisions.

## M3 — complete
- [x] Add LLM provider abstraction.
- [x] Add first provider adapter (OpenAI Responses API) behind the generic boundary.
- [x] Add reusable OpenAI-compatible Chat Completions transport.
- [x] Add Ollama Cloud and Z.ai runtime presets without changing Planner logic.
- [x] Build Planner input from `factorioCapabilityRegistry`.
- [x] Produce structured Planner output and validate derived output through `ModSpecSchema`.
- [x] Derive Factorio target and semantic assertions deterministically rather than asking the model to duplicate them.
- [x] Add supported/unsupported classification.
- [x] Add bounded retry for malformed/invalid structured Planner output.
- [x] Track provider/model/token/cost metadata.
- [x] Create 24-case golden natural-language prompt eval set.
- [x] Add reusable eval runner and `pnpm planner:eval`.
- [x] Set dev/eval provider defaults: Z.ai `glm-5.3-flash`, Ollama Cloud `deepseek-v4.1-flash:cloud`.
- [x] Add ADR-0009 for the constrained Planner/provider boundary.
- [x] Configure a real runtime API key locally and run the golden eval corpus.
- [x] Reach classification accuracy >= 90% (Ollama Cloud baseline: 24/24 = 100%).
- [x] Reach supported ModSpec accuracy >= 80% (Ollama Cloud baseline: 12/12 = 100%).
- [x] Review initial failed cases and fix the Planner contract/Ollama reasoning transport issue without weakening deterministic scope.

## M3 exit review
- [x] Planner never writes files or Lua directly.
- [x] Invalid structured output is rejected/retried with a bounded two-attempt default.
- [x] Real-model golden eval exceeds both development gates.
- [x] Deterministic target/assertion derivation and registry checks remain authoritative.
- [x] Provider/model/usage metadata is captured.
- [x] Verify Z.ai Coding Plan routing separately from general quota; `glm-5.3-flash` reaches 24/24 classification and 12/12 supported ModSpec on the coding endpoint.

## M4 — complete
- [x] Define typed Repair input/output contract around original ModSpec, prior manifest, and runtime-validated normalized error.
- [x] Enforce a hard maximum of 2 Repair model attempts.
- [x] Restrict model output to replacement `data.lua` only; preserve ModSpec, `info.json`, paths/roles, and semantic assertions.
- [x] Repair only `factorio_load_failed` and `semantic_assertion_failed`; do not send packaging/process/application failures to the model.
- [x] Track Repair attempt history, provider/model/token/cost metadata, validation outcome, and terminal reason.
- [x] Add fake-provider tests for success, retry, exhaustion, schema rejection, scope expansion, and infrastructure failure.
- [x] Add real-Factorio integration proving load and semantic failures are repaired under the original assertions.
- [x] Add 5-case Repair golden corpus across all four capability families.
- [x] Run live Repair evals; Z.ai Coding Plan `glm-5.3-flash` repairs 5/5 cases with 5 total attempts.
- [x] Add ADR-0010 for the bounded data.lua-only Repair boundary.

## M4 exit review
- [x] Repair cannot change accepted intent without replanning.
- [x] Every candidate is revalidated by real Factorio plus the original semantic assertions.
- [x] Repair loops terminate after at most two model attempts.
- [x] Attempt history and usage metadata are observable and persistence-ready.
- [x] Live Repair golden eval exceeds the initial 80% development gate (100% / 5 of 5).

## M5 — complete
- [x] Build reusable `runLocalFactorioGeneration` orchestration in `packages/agent-core`.
- [x] Add `pnpm prompt:build -- "<request>"` for prompt -> Planner -> generation -> Factorio -> optional Repair -> ZIP.
- [x] Surface bounded structured progress and terminal supported/unsupported/typed-failure states.
- [x] Aggregate Planner + Repair attempts, token/cost metadata, total duration, and validation metadata.
- [x] Return/write the installable ZIP only after real Factorio validation passes.
- [x] Persist git-ignored local run reports under `.runs/<generation-id>.json`.
- [x] Add `pnpm prompt:feedback` to attach bounded up/down feedback and a note to a run report.
- [x] Add unit coverage for direct success, unsupported, Repair path, typed infrastructure failure, report persistence, and feedback safety.
- [x] Add real-Factorio prompt-to-ZIP integration coverage.
- [x] Run live Z.ai `glm-5.3-flash` smoke: validated ZIP in 5.4 s, one Planner attempt, 2,215 tokens.

## M5 exit review
- [x] Another person can run the supported flow without editing source code.
- [x] Progress, unsupported scope, typed failures, and final artifact path are machine-readable.
- [x] Local telemetry captures duration, Planner/Repair attempts, token usage, optional configured cost, and validation metadata.
- [x] Feedback is locally capturable by generation ID.
- [x] ZIP publication remains downstream of real Factorio + semantic validation.

## M6A — Minimum Interesting Product — complete
- [x] Add backward-compatible mixed ModSpec composition across multiple primitive capability families.
- [x] Make Planner preserve multiple heterogeneous supported changes in one request.
- [x] Dispatch mixed changes/assertions deterministically without adding an arbitrary-Lua path.
- [x] Expand reviewed numeric prototype speed targets to assembling machines, mining drills, transport belts, inserters, and labs using pinned 2.0.77 baselines.
- [x] Add real-Factorio validation for a multi-family fast-start bundle.
- [x] Add iterative follow-up editing of an accepted successful tweak bundle through a new immutable revision generation.
- [x] Add reviewed recipe crafting-time, existing recipe-result amount, and item stack-size primitives with semantic assertions.
- [x] Finalize the first mixed-request golden eval slice and rerun the live Planner gate (24/24 classification, 14/14 exact supported ModSpecs on Z.ai `glm-5.3-flash`).
- [x] Deploy compound requests, iterative revisions, and reviewed crafting-time/result/stack-size primitives to the tailnet-only home-server runtime (`40d28e1`) and verify live UI/health, apps-health, and host network checks.

### M6A exit review — 2026-10-11
- [x] Run a fresh product/scope review against the deployed seven-family runtime and realistic non-golden prompts.
- [x] Prevent universal/category prompts from silently partially applying when the registry covers only some members (review reproduced this with `Make all inserters twice as fast`: burner and long-handed inserters were omitted).
- [x] Show the exact interpreted change list, and revision diff, in tester UI so a successful Factorio validation cannot hide a prompt-to-ModSpec interpretation mistake.
- [x] Add an owner-scoped recent-generation/history flow so reload/returning users can reopen downloads and continue revisions instead of losing the in-memory generation ID.
- [x] State the validation environment explicitly in the UI: current success proves the generated mod against isolated base-game Factorio 2.0.77, not arbitrary third-party mod stacks or unvalidated DLC combinations.
- [x] Add the exit-review adversarial prompts to regression/eval coverage and rerun the live Planner gate after fixing partial-fulfillment semantics.
- [x] Re-run the M6A exit review; if green, start with a 5–10 player external cohort before scaling recruitment to the 30+ M6 target.

## M6 — in progress

### Service boundary
- [x] Add `packages/service-core` with runtime generation/job/telemetry/artifact contracts.
- [x] Define `queued -> running -> succeeded | unsupported | failed` lifecycle.
- [x] Keep queue payload versioned and limited to `generationId`.
- [x] Add revision-based repository compare-and-set claiming/updates plus duplicate terminal delivery idempotency.
- [x] Add bounded terminal feedback contract.
- [x] Document initial HTTP/API shape in `docs/service-contract.md`.
- [x] Add ADR-0011 for the asynchronous API/worker boundary.

### Persistence, queue, artifacts
- [x] Choose PostgreSQL + Drizzle/node-postgres + pg-boss and S3-compatible object storage; record ADR-0012.
- [x] Implement PostgreSQL generation repository and versioned migrations.
- [x] Implement pg-boss generation queue using the same PostgreSQL deployment.
- [x] Make PostgreSQL submit persist+enqueue atomic through Drizzle transaction + pg-boss `fromDrizzle`.
- [x] Add checksum-pinned PostgreSQL 18.6 dev runtime plus real migration/repository/queue/rollback integration tests.
- [x] Implement private S3-compatible artifact store and bounded presigned download flow through AWS SDK v3.
- [x] Add Docker-backed S3-compatible integration smoke with upload + presigned download byte round-trip.
- [x] Run storage smoke against the actual private-beta S3-compatible provider (SeaweedFS 4.39 on the Helsinki VPS; upload -> presigned GET -> byte compare -> delete).

### Worker/API
- [x] Adapt M5 `runLocalFactorioGeneration` into the service `GenerationExecutor` without exposing local `.runs` persistence.
- [x] Add executable pg-boss worker process consuming generation jobs and preserving typed terminal outcomes/telemetry.
- [x] Add Docker-backed full service integration: atomic submit -> pg-boss worker -> real Factorio -> S3-compatible upload -> persisted success -> presigned download.
- [x] Add authenticated `POST /v1/generations`, `GET /v1/generations/:id`, terminal feedback, and signed-download endpoints.
- [x] Add ADR-0013 for private-beta token auth, generation ownership, and PostgreSQL rate limits.
- [x] Add operator CLI for creating beta users/tokens and a versioned migration CLI.
- [x] Add operator-provisioned opaque bearer tokens stored only as SHA-256 hashes, generation ownership, and PostgreSQL per-user/salted-IP rate limits.
- [x] Add minimal same-origin private-beta tester UI for token entry, prompt submission, status polling, ZIP download, and feedback.
- [x] Add beta onboarding UX: scope guidance, known-good prompts, clearer result states, install guidance, and explicit unsupported/retryable messaging.
- [x] Add a user-friendly bilingual EN/RU tester UI with localized examples, results/change summaries, browser-locale default, persisted language choice, and Russian broad-scope safety coverage.
- [x] Deploy the bilingual EN/RU tester UI to the tailnet-only home-server runtime (`6d4b98c`) and verify live locale markers, container health, apps-health, and host network checks.
- [x] Add running-generation heartbeat and CAS-safe stale-running recovery to retryable `failed`.
- [x] Add explicit retry policy: no automatic pg-boss retries; retryable failures create a new generation through owner-scoped `/retry`.

### Private deployment/beta
- [x] Add production JS package exports, Docker web/worker targets, container smoke, hosted S3 smoke command, and deployment runbook.
- [x] Deploy API, worker, PostgreSQL, and private object storage to the Helsinki VPS with persistent volumes and tailnet-only HTTPS ingress.
- [x] Run deployed live Z.ai `glm-5.3-flash` E2E: API -> pg-boss -> worker -> Factorio -> SeaweedFS -> presigned ZIP -> feedback/survey.
- [ ] Enable public HTTPS ingress for testers outside the tailnet (Tailscale Funnel approval or a conventional public domain/reverse proxy).
- [x] Instrument private-beta KPI report plus explicit willingness-to-pay survey.
- [x] Exclude explicit internal/operator smoke accounts and all of their activity from product KPI reporting.
- [ ] Recruit 30+ testers and evaluate the M6 product hypotheses from observed data.

## Agent task template
A task sent to Codex/Claude should include:

```text
Goal:
<one coherent outcome>

Read first:
- AGENTS.md
- relevant spec/ADR files
- relevant source/tests

Requirements:
- <bounded list>

Non-goals:
- <what not to change>

Verification:
- <specific commands/tests>

Done when:
- requested behavior exists
- tests pass
- no unrelated refactor
- docs/ADR updated if a contract or architecture decision changed
```
