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

The first Ollama run exposed a reasoning/JSON transport issue plus an underspecified typed-change prompt contract. After disabling thinking for the JSON planner transport and documenting exact change shapes, the complete corpus passed. A Z.ai `glm-5.3-flash` attempt returned provider quota errors and was not scored as model quality.

Exit criteria:
- Planner never writes files directly;
- invalid structured output is rejected/retried in a bounded way;
- golden prompts show acceptable supported/unsupported classification and ModSpec accuracy;
- deterministic downstream pipeline remains unchanged.

## M4 — Repair loop
Status: next.

Goal: automatically fix bounded generation/validation failures.

Scope:
- normalized error contract passed to Repair;
- maximum 2 repairs;
- attempt history and cost tracking;
- regression evals for known failure modes.

Exit criteria:
- repair cannot expand scope beyond the accepted ModSpec without replanning;
- attempts are persisted/observable;
- loops terminate deterministically.

## M5 — Local end-to-end prototype
Goal: prompt -> validated ZIP through one local interface.

Scope:
- simple CLI or minimal local web UI;
- generation status/progress;
- artifact download/path;
- user feedback capture.

Exit criteria:
- another person can use the flow without editing source code;
- end-to-end success/failure is understandable;
- local telemetry captures duration, attempts, and cost.

## M6 — Private beta service
Goal: validate product usefulness with real Factorio players.

Scope:
- web/API and worker separation if needed by observed usage;
- PostgreSQL persistence;
- queueing;
- object storage;
- basic authentication/rate limiting;
- private deployment;
- 30+ testers target.

Exit criteria are the product hypotheses in `product-spec.md`, especially success rate, false-success rate, repeat usage, and willingness to pay.

## Deferred until beta evidence
- second game adapter;
- marketplace;
- subscriptions/complex billing;
- asset generation;
- runtime `control.lua` systems;
- Steam Workshop publishing;
- desktop/mobile clients.
