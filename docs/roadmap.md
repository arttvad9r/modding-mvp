# Roadmap v0.1

The roadmap is milestone-based rather than calendar-based. AI-agent availability and implementation feedback may change elapsed time, but milestone exit criteria should remain explicit.

## M0 — Factorio Mod Test Harness
Status: complete.

Goal: prove that the project can automatically distinguish a loadable Factorio mod from a broken one using the real game runtime.

Exit criteria:
- pinned Factorio 2.0.x headless runtime can be installed reproducibly;
- candidate mod is copied into an isolated test directory;
- valid fixture returns PASS;
- broken fixture returns structured FAIL;
- unit, integration, typecheck, and build checks pass.

## M1 — Deterministic ModSpec engine
Status: complete.

Goal: produce working Factorio mods from typed JSON without any LLM involvement.

Scope:
- `domain` package with typed ModSpec schema;
- one supported capability: prototype scalar property mutation;
- deterministic Factorio generator;
- semantic assertion generation;
- packaging to installable ZIP;
- M0 runtime validation integrated as the final authority.

Exit criteria:
- at least 5 deterministic ModSpec fixtures produce expected mods;
- invalid/unsupported ModSpecs fail before Factorio execution;
- generated mods pass semantic assertions in Factorio;
- one command executes ModSpec -> generation -> Factorio/semantic validation -> ZIP.

## M2 — Expand deterministic capabilities
Status: complete.

Goal: establish enough safe primitives for a useful first Planner.

Completed slices:
- `recipe_ingredient`: set/multiply the amount of an existing allow-listed base-game item ingredient, with semantic validation and validated ZIP output;
- `technology_cost`: set/multiply finite research `unit.count` for allow-listed base-game technologies, with semantic validation and validated ZIP output;
- `technology_prerequisite`: add/remove one reviewed prerequisite edge with baseline-aware semantic validation;
- deterministic E2E corpus: 20 real Factorio fixtures across four capability families;
- `packages/factorio-knowledge` plus machine-readable capability registry for future Planner discovery;
- typed cross-pipeline error taxonomy with schema/unsupported/generation/packaging/Factorio/semantic/process distinctions.

Exit criteria:
- >= 20 deterministic ModSpec fixtures across capability families;
- no generated code path requires arbitrary shell access;
- errors identify whether failure is schema, generation, Factorio-load, or semantic assertion.

## M3 — Natural-language Planner
Status: complete.

Goal: map a user prompt to a supported ModSpec.

Completed slices:
- provider-agnostic `LlmProvider` JSON contract in `packages/llm`;
- OpenAI Responses and OpenAI-compatible Chat Completions transports with provider/model/token/cost metadata;
- constrained Planner in `packages/agent-core`;
- Planner scope built from `factorioCapabilityRegistry`;
- deterministic target/assertion derivation followed by `ModSpecSchema` validation;
- explicit supported/unsupported classification;
- two-attempt bounded correction for malformed/invalid structured output;
- 24-case golden prompt corpus plus reusable eval runner;
- live Ollama Cloud `deepseek-v4.1-flash:cloud` baseline: 24/24 classification and 12/12 supported ModSpec cases (100% / 100%).

The first Ollama run exposed a reasoning/JSON transport issue plus an underspecified typed-change prompt contract. After disabling thinking for the JSON planner transport and documenting exact change shapes, the complete corpus passed. The initial Z.ai attempt used the general endpoint with a Coding Plan key and hit the wrong quota. Re-running on `https://api.z.ai/api/coding/paas/v4` with `glm-5.3-flash` passed 24/24 classification and 12/12 supported ModSpec cases (100% / 100%).

Exit criteria:
- Planner never writes files directly;
- invalid structured output is rejected/retried in a bounded way;
- golden prompts show acceptable supported/unsupported classification and ModSpec accuracy;
- deterministic downstream pipeline remains unchanged.

## M4 — Repair loop
Status: complete.

Goal: automatically fix bounded generation/validation failures without changing accepted user intent.

Completed slices:
- typed Repair contract around immutable ModSpec, previous bounded manifest, normalized error, provider, and validator;
- `data.lua`-only model output while metadata, paths, semantic assertions, and ModSpec remain application-owned;
- only Factorio load and semantic assertion failures are Repair-eligible; infrastructure/application failures bypass the model;
- hard maximum of 2 model attempts with observable attempt/provider/model/usage/error history;
- real-Factorio validation entrypoint for repaired bounded manifests using the original semantic assertions;
- 5-case Repair golden corpus spanning load failure plus all four deterministic capability families;
- live Z.ai Coding Plan `glm-5.3-flash` baseline: 5/5 repaired with 5 total model attempts.

Exit criteria:
- repair cannot expand scope beyond the accepted ModSpec without replanning;
- attempts are observable/persistence-ready;
- every candidate passes the original semantic assertions before success;
- loops terminate deterministically after at most two model attempts.

## M5 — Local end-to-end prototype
Status: complete.

Goal: prompt -> validated ZIP through one local interface.

Completed slices:
- reusable `packages/agent-core` orchestration for Planner -> generation -> Factorio -> bounded Repair -> ZIP;
- `pnpm prompt:build` user-facing CLI with structured progress and terminal JSON;
- git-ignored `.runs/<generation-id>.json` reports with prompt, ModSpec, attempts, token/cost metadata, duration, validation state, and artifact/error;
- `pnpm prompt:feedback` local feedback capture;
- real-Factorio prompt-to-ZIP integration test;
- live Z.ai Coding Plan `glm-5.3-flash` smoke producing a validated ZIP in about 5.4 seconds.

Exit criteria:
- another person can use the flow without editing source code;
- end-to-end success/failure and unsupported scope are machine-readable;
- local telemetry captures duration, attempts, token usage/optional configured cost, and validation metadata;
- ZIP is exposed only after real Factorio + semantic validation succeeds.

## M6A — Minimum Interesting Product
Status: in progress.

Goal: make the already-working service materially more useful than asking a general chat model for one tiny Lua edit before recruiting external testers.

Completed M6A slices:
- backward-compatible `mixed` ModSpec composition across existing typed capability families;
- Planner support for extracting multiple heterogeneous changes from one prompt without exposing Lua/files;
- deterministic per-change generator dispatch and semantic assertions for mixed bundles;
- reviewed `prototype_property` expansion to assembler, mining-drill, transport-belt, inserter, lab, and furnace speed properties using Factorio 2.0.77 baselines;
- real-Factorio integration proving a six-change fast-start bundle across prototype, recipe, and research families;
- updated live Z.ai Planner gate: 24/24 classification and 14/14 exact supported ModSpecs on the 24-case corpus;
- live natural-language four-change mixed smoke: one Planner attempt -> real Factorio validation -> ZIP in 8.1 s, no Repair.
- compound-request and follow-up-revision beta UX deployed tailnet-only on the home server from runtime commit `aa9bdcc`; live UI/health, apps-health, and `verify-stack` pass (30 OK / 0 warnings / 0 failures).
- iterative follow-up revision flow: an owned successful generation can create a new immutable child generation carrying `sourceGenerationId` plus an accepted `baseModSpec` snapshot; the Revision Planner emits the complete resulting typed bundle and the normal Factorio validation/ZIP pipeline runs again;
- Docker service E2E proves initial generation -> `/revise` -> second queue job -> real Factorio -> second S3 artifact; live Z.ai `glm-5.3-flash` revision smoke preserved unchanged tweaks, removed a restored-to-base research tweak, changed furnace `×1.5 -> ×1.875`, and produced a validated ZIP in about 12.4 s with no Repair.

Remaining scope before external recruitment:
- add the next high-value safe primitives based on tweak-pack usefulness (candidate areas: recipe crafting time/results and item stack sizes), with real-runtime semantic coverage;
- extend the mixed-request golden corpus as new primitives are added and keep the live Planner gate green.

Exit criteria:
- one natural-language request can express a useful multi-change rebalance and produce one validated ZIP;
- all requested supported changes are preserved exactly and unsupported compound requests are never silently partially fulfilled;
- a user can revise an accepted bundle through the product rather than starting from source code;
- Planner mixed-request eval remains above the existing classification/semantic development gates.

## M6 — Private beta service
Status: infrastructure ready; external recruitment gated on M6A.

Goal: validate product usefulness with real Factorio players after the M6A product-value gate.

Completed slices:
- `packages/service-core` runtime schemas for generation records/jobs/telemetry/artifact refs;
- asynchronous API/worker lifecycle with compare-and-set claiming and terminal redelivery idempotency;
- infrastructure ports for repository, queue, artifact store, and generation executor;
- `packages/factorio-service-executor` adapter that runs M5 in an isolated temp root, returns validated ZIP bytes/service telemetry, and removes local run files;
- real-Factorio integration coverage for the service executor adapter;
- `packages/service-postgres` with Drizzle migration, revision-CAS repository, pg-boss queue, and atomic record+job submission;
- checksum-pinned PostgreSQL 18.6 local integration runtime proving migration/CAS/queue/transaction rollback;
- `packages/service-s3` private ZIP artifact adapter with safe key/name validation and 30–900 second presigned GET URLs;
- explicit retry policy with automatic pg-boss retries disabled and owner-triggered fresh-generation retries for retryable failures;
- AWS SDK HTTP integration smoke plus Docker-backed S3-compatible PutObject/presigned-GetObject byte round-trip;
- initial HTTP/service contract in `docs/service-contract.md`;
- ADR-0011 asynchronous service/worker boundary;
- ADR-0012 PostgreSQL + Drizzle/node-postgres + pg-boss + S3-compatible storage default;
- `apps/worker` executable pg-boss consumer with generation heartbeats/stale recovery;
- Docker-backed full service integration proving atomic submit -> worker -> real Factorio -> object storage -> persisted success -> presigned download;
- authenticated HTTP API for create/get/feedback/download with generation ownership;
- operator-provisioned opaque beta tokens, PostgreSQL per-user/salted-IP rate limits, migration/user-provisioning CLIs, and ADR-0013;
- Docker-backed HTTP integration proving bearer auth -> API -> queue -> worker -> real Factorio -> download -> feedback;
- same-origin tester UI with explicit retry and willingness-to-pay survey;
- tester-facing beta onboarding UX with current-scope guidance, known-good prompt examples, clearer generation states, install guidance, and explicit unsupported/retryable messaging;
- `pnpm beta:kpis` report for active/repeat testers, success/direct-success, duration/Factorio validation, feedback/false-success proxy, WTP, tokens/cost, and Repair attempts, with explicit internal/smoke users excluded.
- production-conditional workspace exports, compiled-runtime smoke, slim production-only web/worker Docker targets, provider-neutral deployment runbook, and hosted S3 smoke command;
- Helsinki VPS beta stack with pinned PostgreSQL 18.6 + SeaweedFS 4.39, persistent volumes, fixed private Docker subnet, and tailnet-only HTTPS via Tailscale Serve;
- hosted SeaweedFS smoke proving upload -> presigned GET -> byte comparison -> delete;
- deployed live Z.ai `glm-5.3-flash` E2E proving API -> pg-boss -> worker -> real Factorio -> private object storage -> presigned ZIP -> feedback/survey; the first server smoke succeeded directly in 19.1 s using 2,205 tokens.

Remaining scope after M6A exits:
- enable public HTTPS ingress for testers outside the tailnet (Tailscale Funnel requires tailnet-admin approval, or use a conventional public domain/reverse proxy);
- recruit 30+ active testers and evaluate the product hypotheses from observed beta data.

Exit criteria are the product hypotheses in `product-spec.md`, especially success rate, false-success rate, repeat usage, and willingness to pay.

## Deferred until beta evidence
- second game adapter;
- marketplace;
- subscriptions/complex billing;
- asset generation;
- runtime `control.lua` systems;
- Steam Workshop publishing;
- desktop/mobile clients.
