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
Status: complete.

Goal: make the already-working service materially more useful than asking a general chat model for one tiny Lua edit before recruiting external testers.

Completed M6A slices:
- backward-compatible `mixed` ModSpec composition across existing typed capability families;
- Planner support for extracting multiple heterogeneous changes from one prompt without exposing Lua/files;
- deterministic per-change generator dispatch and semantic assertions for mixed bundles;
- reviewed `prototype_property` expansion to assembler, mining-drill, transport-belt, inserter, lab, and furnace speed properties using Factorio 2.0.77 baselines;
- real-Factorio integration proving a six-change fast-start bundle across prototype, recipe, and research families;
- updated live Z.ai Planner gate: 24/24 classification and 14/14 exact supported ModSpecs on the 24-case corpus;
- live natural-language four-change mixed smoke: one Planner attempt -> real Factorio validation -> ZIP in 8.1 s, no Repair.
- compound-request, follow-up-revision, high-value rebalance, and bilingual EN/RU beta UX deployed tailnet-only on the home server from runtime commit `6d4b98c`; live UI/health, apps-health, and `verify-stack` pass (30 OK / 0 warnings / 0 failures).
- iterative follow-up revision flow: an owned successful generation can create a new immutable child generation carrying `sourceGenerationId` plus an accepted `baseModSpec` snapshot; the Revision Planner emits the complete resulting typed bundle and the normal Factorio validation/ZIP pipeline runs again;
- Docker service E2E proves initial generation -> `/revise` -> second queue job -> real Factorio -> second S3 artifact; live Z.ai `glm-5.3-flash` revision smoke preserved unchanged tweaks, removed a restored-to-base research tweak, changed furnace `×1.5 -> ×1.875`, and produced a validated ZIP in about 12.4 s with no Repair.
- reviewed `recipe_crafting_time`, `recipe_result`, and `item_stack_size` primitives with registry-derived Planner/Revision support and real-Factorio semantic validation; a mixed regression bundle changes gear crafting time, belt output, and circuit stack size in one validated ZIP.
- refreshed live Z.ai `glm-5.3-flash` Planner gate on the expanded seven-family corpus: **27/27 classification and 17/17 exact supported ModSpecs**; live Throughput bundle smoke (gear crafting ×0.5, belt output = 4, circuit stack = 500) completed prompt -> validated ZIP in **7.957 s**, including **1.676 s** Factorio validation, **4,466 tokens**, and no Repair.

Final exit review on 2026-10-11: **passed**. The first review found a silent partial-fulfillment risk for broad category wording (`all inserters`) plus three tester-trust gaps. The release now rejects broad/universal category requests conservatively unless exact targets are named, exposes the accepted change list and revision diff, provides owner-scoped recent-generation recovery, and states that automated validation is against isolated base-game Factorio 2.0.77 rather than arbitrary third-party mod stacks or Space Age. The adversarial/bilingual Planner corpus now covers 38 cases and Z.ai `glm-5.3-flash` passes **38/38 classification and 21/21 exact supported ModSpecs**, including the four Russian example prompts and Russian broad-scope rejection cases. Full typecheck/unit/build/real-Factorio integration and Docker service E2E also pass.

M6A is therefore closed. External recruitment should start with a 5–10 player cohort, then scale toward the 30+ M6 target only after reviewing their first usage/feedback.

Exit criteria:
- one natural-language request can express a useful multi-change rebalance and produce one validated ZIP;
- all requested supported changes are preserved exactly and unsupported compound requests are never silently partially fulfilled;
- a user can revise an accepted bundle through the product rather than starting from source code;
- Planner mixed-request eval remains above the existing classification/semantic development gates.

## M6B — Content Mods before external beta
Status: complete (2026-10-11).

Goal: make the product capable of creating meaningful new Factorio content, not only changing existing values, while preserving deterministic typed generation and real-runtime semantic validation.

Implemented content slices are `new_item`, `new_recipe`, and `new_machine`, and they can compose into one validated content graph.

`new_item`:
- create a new intermediate item from a reviewed base item visual/template;
- define stack size, item-only crafting recipe, and existing/new technology unlock;
- allow the declared `custom-*` item to feed `new_recipe` and `new_machine` changes in the same bundle;
- reject undeclared custom references and prototype-name collisions before generation.

`new_machine`:
- create a new assembling machine or electric furnace from one reviewed base-game template;
- create its placeable item and recipe with reviewed existing ingredient items;
- set final crafting speed, energy use, module slots, stack size, and recipe crafting time;
- unlock through one reviewed existing technology or create one new technology with reviewed prerequisites/science tier/count/time;
- inherit base-game graphics/icons instead of generating assets;
- derive and execute semantic assertions covering the whole created content bundle;
- support follow-up revisions using the existing immutable revision flow.

`new_recipe`:
- create a new alternative item-only recipe for one reviewed existing base-game item;
- specify reviewed ingredients, result amount, and crafting time;
- unlock via an existing reviewed technology or one new bounded technology;
- semantically validate recipe shape and unlock in real Factorio.

Exit review: **passed**. Deterministic `new_item` / `new_recipe` / `new_machine` bundles and linked content trees build validated installable ZIPs in Factorio 2.0.77; the final live Planner gate passes **53/53 classification and 34/34 exact supported ModSpecs**; the bilingual UI exposes material/recipe/machine/content-chain examples and structured accepted-change/revision-diff output; full typecheck/unit/build/real-Factorio/service E2E remains green. M6B first deployed from `793f1be`; the current tailnet-only runtime is `f2f1ae6`, which adds structured beta feedback/download-start KPI instrumentation plus provider-level failover support. The deployed worker remains on Z.ai until the Ollama production credential is installed, after which Ollama Cloud `glm-5.3-flash` becomes primary and Z.ai the fallback. Web/worker are restart=0/OOM=false, apps-health is OK, and verify-stack reports 30 OK / 0 warnings / 0 failures.

M6B stops at this bounded data-stage content graph for the first external beta. Arbitrary `control.lua` and generated/custom assets are separate later stages because the current validation boundary does not prove runtime-event behavior, save/multiplayer behavior, or media correctness.

## M6 — Private beta service
Status: in progress; M6A and M6B passed, so the next gate is the first external player cohort/public ingress.

Goal: validate product usefulness with real Factorio players after the M6A trust gate and M6B content-value expansion.

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

Remaining scope after M6B:
- enable public HTTPS ingress for testers outside the tailnet (prefer the planned dedicated public VPS/reverse proxy rather than exposing the home server directly);
- recruit a first 5–10 player cohort, review prompt/support/false-success feedback, then scale toward 30+ active testers and evaluate the product hypotheses from observed beta data.

Exit criteria are the product hypotheses in `product-spec.md`, especially success rate, false-success rate, repeat usage, and willingness to pay.

## Deferred until beta evidence
- second game adapter;
- marketplace;
- subscriptions/complex billing;
- asset generation;
- runtime `control.lua` systems;
- Steam Workshop publishing;
- desktop/mobile clients.
