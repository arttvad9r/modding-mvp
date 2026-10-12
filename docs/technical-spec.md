# Technical specification v0.5

## System goal
Implement a bounded pipeline that converts a user request into a Factorio mod artifact and validates the artifact with the real game runtime before reporting success.

## Target pipeline
`prompt -> Planner -> ModSpec -> Generator -> static validation -> Factorio validation -> bounded Repair -> package`

## Primary contracts

### ModSpec
`ModSpec` is the typed intermediate representation between natural-language intent and generated Lua. The Planner may use an LLM, but downstream generation and validation should consume typed fields instead of free-form prose wherever possible.

Minimum fields planned for M1:
- title and slug;
- target game and supported game version line;
- one or more typed changes;
- expected assertions/tests;
- capability summary identifier (`mixed` when multiple primitive families are composed).

Implemented capability-specific ModSpec variants:
- `prototype_property` — scalar mutation of an allow-listed prototype property;
- `recipe_ingredient` — amount mutation of an existing allow-listed item ingredient in an existing base-game recipe;
- `recipe_crafting_time` — crafting-time mutation for an allow-listed base-game recipe;
- `recipe_result` — amount mutation of an existing allow-listed item result in an existing base-game recipe;
- `item_stack_size` — stack-size mutation for an allow-listed base-game item;
- `technology_cost` — mutation of finite research `unit.count` for an allow-listed base-game technology;
- `technology_prerequisite` — add/remove one reviewed prerequisite edge between base-game technologies;
- `new_machine` — create a new reviewed machine prototype (assembling machine, chemical plant, oil refinery, centrifuge, electric furnace, electric mining drill, or lab) by cloning a pinned base-game template, plus a new placeable item, recipe, and existing/new technology unlock;
- `new_recipe` — create a new alternative item-only recipe for a reviewed existing base-game result item or same-bundle custom item, with an existing/new technology unlock;
- `new_item` — create a new intermediate item from a reviewed base item template, plus its item-only recipe and existing/new technology unlock.

Legacy single-family ModSpec variants remain valid. A `mixed` ModSpec may compose two or more primitive families in one specification while keeping each change and assertion typed. `mixed` is not a registry capability: every contained change must pass the support rules of its primitive family. Runtime validation for these contracts lives in `packages/domain` and uses Zod schemas; TypeScript types are inferred from the runtime schemas so validation and static types stay aligned. See ADR-0015.

For `prototype_property`, `packages/factorio-generator` supports reviewed numeric speed properties on base-game furnaces, assembling machines, mining drills, transport belts, inserters, and labs. The allow-list stores the pinned Factorio 2.0.77 base value for each supported address so relative operations such as `multiply` can be converted into an absolute semantic expectation.

For `recipe_ingredient`, M2 initially supports existing item ingredients only. The versioned allow-list stores the recipe, ingredient type/name, and base amount. `set` and `multiply` are supported only when the resulting item amount is an integer in `1..65535`; invalid amounts fail before Factorio execution. The generator locates the named ingredient inside `data.raw["recipe"][recipe].ingredients` and mutates only its `amount`. New ingredients, ingredient removal, fluids, and recipe products are outside this first recipe capability.

For `recipe_crafting_time`, M6A supports reviewed recipes with a pinned baseline. Factorio recipes that omit `energy_required` use the engine default baseline `0.5`; generation resolves the current value as `recipe.energy_required or <baseline>`, then writes an explicit final value. Final time is constrained to `0.001..3600` seconds.

For `recipe_result`, M6A supports only existing reviewed item results. The final result amount must be an integer in `1..65535`; adding/removing results and fluid-result changes remain unsupported.

For `item_stack_size`, M6A supports only reviewed base-game item prototypes. The final stack size must be an integer in `1..65535`.

For `technology_cost`, M2 supports allow-listed technologies with a finite numeric `unit.count`. Baselines are read from the pinned Factorio 2.0.77 base data. `set` and `multiply` are accepted only when the resulting count is a positive safe integer. Technologies using `count_formula` are intentionally outside this first technology capability.

For `technology_prerequisite`, M2 supports only reviewed technology/prerequisite pairs. Each pair permits exactly one baseline-aware `add` or `remove` operation; arbitrary graph edits are rejected before Factorio execution.

For `new_machine`, the registry supports reviewed templates `assembling-machine-2`, `assembling-machine-3`, `chemical-plant`, `oil-refinery`, `centrifuge` (machine type `assembling-machine`), `electric-furnace` (`furnace`), `electric-mining-drill` (`mining-drill`), and `lab` (`lab`); `factorio-knowledge` is the authoritative list. The new internal ID must use the `custom-` namespace. Entity/item graphics and icons are inherited through `table.deepcopy`; generated media is not part of this capability. The typed change carries the final template speed (`crafting_speed`, `mining_speed`, or `researching_speed`), energy usage, module slots, stack size, recipe time/ingredients, and an unlock policy. Recipe ingredients and referenced technologies are registry allow-listed. Unlocking may append an effect to one existing reviewed technology or create one technology cloned from a reviewed base template with an application-derived ID, exact prerequisites, science tier, count, and time. Semantic validation checks existence and all requested machine/item/recipe/unlock fields in real Factorio.

For `new_recipe`, M6B creates one new disabled `recipe` prototype whose internal ID uses the `custom-` namespace. Ingredients and the single result are item-only and may reference reviewed base-game items or a `new_item` declared in the same ModSpec. The change carries display name, exact crafting time, ingredients, result amount, and the same bounded existing/new technology unlock policy. Semantic validation checks the complete ingredient/result definition and unlock effect. Fluid recipes remain outside this capability.

For `new_item`, M6B clones one reviewed non-placeable base `item` template to inherit icon/subgroup/order, assigns a `custom-` internal ID/display name/stack size, creates its item-only recipe, and attaches an existing/new technology unlock. Its own recipe currently consumes reviewed base-game items only. The application collects the accepted `new_item` names and permits those exact identifiers as ingredients/results of `new_machine` and `new_recipe` in the same ModSpec; undeclared custom references and cross-content name collisions are rejected before Factorio execution. The generator renders new items before dependent content and real-Factorio assertions validate item, recipe, and research definition.

Official prototype references: `RecipePrototype::ingredients`, `ItemIngredientPrototype::amount`, and `TechnologyUnit::count` in the Factorio prototype documentation.

### Capability registry
`packages/factorio-knowledge` is the machine-readable Factorio support boundary. It owns the allow-listed targets/baselines used by deterministic generation plus `factorioCapabilityRegistry`, which exposes capability IDs, target/version policy, operations, constraints, prompt examples, and exact supported targets.

The future Planner must derive supported scope from this registry instead of maintaining an independent capability list in prompt text. Registry targets are generated from the same allow-lists used by generator lookup functions. See `docs/capabilities.md` and ADR-0007.

### Planner provider boundary
`packages/llm` exposes a provider-agnostic JSON contract. `packages/agent-core` does not import vendor SDKs or depend on vendor HTTP response shapes. Runtime provider selection is configuration-only.

Implemented transports/presets:
- OpenAI Responses API for direct OpenAI use;
- OpenAI-compatible Chat Completions for Ollama Cloud at `https://ollama.com/v1`;
- OpenAI-compatible Chat Completions for Z.ai, using `https://api.z.ai/api/paas/v4` for general/prepaid usage or `https://api.z.ai/api/coding/paas/v4` for Coding Plan keys.

Ollama Cloud uses JSON mode plus application-side Zod validation/retry; strict provider-native structured outputs are not assumed. Ollama GLM 5.3-family models keep reasoning enabled, so the preset requests `reasoning_effort: low`; this makes the OpenAI-compatible endpoint return reasoning separately while leaving assistant `content` as clean JSON. Other Ollama models retain the previous `reasoning_effort: none` preset. A live transport check showed that sending the unsupported `none` value to `glm-5.3-flash` prepended reasoning prose to assistant content and broke JSON parsing, while `low` restored clean structured output. Z.ai defaults to prompt-only JSON plus the same application validation so Planner correctness does not depend on undocumented response-format behavior. API keys are read only from environment/runtime configuration and are never persisted in prompts or repository files.

The beta worker supports a two-provider chain configured independently from the local CLI provider selector. `LLM_PRIMARY_PROVIDER` chooses the primary provider and optional `LLM_FALLBACK_PROVIDER` chooses a distinct fallback. Failover is deliberately limited to provider-availability failures: retryable planning `process_error` results (network/408/409/429/5xx) and explicit HTTP 401/402/403 auth/quota/billing failures. Product-level `unsupported` results, Planner schema/semantic errors, and deterministic application failures do **not** trigger a second provider. The returned Planner/Repair attempt still records the provider/model that actually produced the accepted response. The beta default is Ollama Cloud `glm-5.3-flash` primary with Z.ai Coding Plan `glm-5.3-flash` fallback.

### Planner contract
`packages/agent-core` owns natural-language planning. It consumes the machine-readable Factorio registry and a provider-agnostic `LlmProvider` from `packages/llm`. The model must not emit Lua, file manifests, target metadata, or semantic assertions.

A supported model response contains only title, kebab-case slug, and typed changes; those changes may span multiple reviewed primitive families. An unsupported response contains a reason. The application derives the single-family or `mixed` ModSpec root, fixed Factorio stable 2.0 target, and matching semantic assertions, validates the result through `ModSpecSchema`, then verifies every change against `packages/factorio-knowledge`. Compound prompts are all-or-unsupported: the Planner must not silently drop an unsupported requested part. Broad/universal category wording (for example `all inserters`) is additionally fail-closed by application code when registry completeness for the human category is not proven; this guard can return `unsupported` before an LLM call.

Malformed or registry-invalid model output receives at most one correction retry by default. Planner calls retain provider, model, token, duration, and optional estimated-cost metadata. The first provider adapter uses the OpenAI Responses API JSON response format through native `fetch`; provider/model choice is configuration. See ADR-0009.

Golden Planner evals live under `evals/planner/`. The initial gate is >=90% supported/unsupported classification accuracy and >=80% exact semantic change accuracy on supported cases. These thresholds are development gates, not product KPI claims. The Planner schema prompt explicitly enumerates the exact JSON shape for each capability-specific change so model quality is measured against a fully specified typed contract rather than implicit TypeScript knowledge.

Recorded Planner baselines on 2026-10-11: the original M3 corpus passed 24/24 classification and 12/12 supported semantic ModSpec cases on both Ollama Cloud `deepseek-v4.1-flash:cloud` and Z.ai Coding Plan `glm-5.3-flash`. After the M6A mixed-bundle/assembler expansion, Z.ai Coding Plan `glm-5.3-flash` passed the updated 24-case corpus at 24/24 classification and 14/14 exact supported semantic ModSpecs (74,458 total tokens), including the new heterogeneous mixed request. The earlier Z.ai HTTP 429/code 1113 result came from sending a Coding Plan key to the general endpoint, whose quota is separate. After the recipe-time/result/stack expansion, the refreshed 27-case Z.ai corpus passed **27/27 classification and 17/17 exact supported semantic ModSpecs** with no failures (115,131 total evaluation tokens).

Final M6B provider comparison on 2026-10-11 used the same 53-case / 34-supported corpus on the same source tree. Ollama Cloud `glm-5.3-flash` with low reasoning passed **53/53 classification and 34/34 exact supported ModSpecs** in 53.48 s using 377,214 reported tokens; applying the public uncached rates configured in telemetry gives a conservative estimated cost of **$0.058388** for the entire corpus. Z.ai Coding Plan `glm-5.3-flash` also passed **53/53 + 34/34**, but took 316.67 s and used 388,031 reported tokens. The five-case Repair corpus passed 5/5 with one attempt per case on both providers; Ollama completed it in 15.57 s / 3,857 tokens versus Z.ai in 69.06 s / 6,507 tokens. An identical linked `Reinforced Plate -> Reinforced Furnace` user request produced real-Factorio-validated ZIPs through both providers; Ollama completed the pipeline in 4.029 s versus 15.327 s on Z.ai. Their generated `data.lua` files were identical; only the model-authored human-readable mod title differed (`&` versus `and`) before deterministic generation.

For M3 development/evaluation, provider presets use `glm-5.3-flash` on Z.ai and `deepseek-v4.1-flash:cloud` on Ollama Cloud by default. These are dev/eval defaults only; provider/model selection remains runtime configuration and is not a production architecture commitment.

### Follow-up revision contract
`packages/agent-core` also exposes a constrained Revision Planner for an already accepted ModSpec. The input is the application-owned base ModSpec plus a bounded follow-up prompt. Supported model output contains only the **complete resulting `changes` array**; it is not a patch and cannot emit title, slug, target, assertions, Lua, or files.

The revision application contract is:
- preserve every existing tweak unless the follow-up explicitly changes or removes/restores it;
- interpret relative follow-up wording against the current accepted bundle;
- return `unsupported` rather than silently dropping an unsupported requested change;
- preserve base title, slug, and target in application code;
- derive the resulting single-family/`mixed` capability and semantic assertions deterministically;
- run the same support checks, deterministic generator, real Factorio validation, optional bounded Repair, and ZIP packaging as a fresh generation.

Live M6A smoke on 2026-10-11 with Z.ai `glm-5.3-flash`: starting from a four-change mixed bundle, the follow-up “keep everything else, restore Automation research cost to normal, and make steel furnaces another 25% faster” produced the expected three-change result (`assembler ×2`, `steel furnace ×1.875`, gears at one plate), passed Factorio in 1,684 ms, completed in 12,399 ms using 4,133 model tokens, and required no Repair. See ADR-0016.

### Generated file manifest
The Generator returns a bounded manifest rather than direct filesystem or shell operations:
- relative path;
- textual content;
- optional role/type metadata.

The generic manifest contract rejects absolute paths, traversal segments, backslashes, empty path segments, duplicate paths, excessive file counts, and oversized text content. The M1 Factorio artifact layer is stricter still: the installable manifest must contain exactly `info.json` (`metadata`) and `data.lua` (`data_stage`). Files such as `control.lua` or validation-only `data-final-fixes.lua` are rejected.

Materialization occurs only inside a fresh temporary build directory. The candidate is validated there, then packaging creates a ZIP with a single top-level `<mod-name>_<version>/` folder. Validation-only companion mod files never enter the ZIP.

### Error taxonomy
Public pipeline failures use `ProjectError` from `packages/domain`. Control flow must use stable `code` and `stage` values rather than parsing message text. Serialized errors expose `code`, `stage`, `message`, `retryable`, and optional bounded `details`; stack traces and raw causes are not part of the public contract. `SerializedProjectErrorSchema` runtime-validates this cross-component form before Repair consumes it.

Initial codes:
- `input_error`;
- `schema_error`;
- `unsupported_capability`;
- `generation_error`;
- `packaging_error`;
- `factorio_load_failed`;
- `semantic_assertion_failed`;
- `process_error`;
- `internal_error` only as an unexpected fallback.

Stages are `input`, `planning`, `generation`, `packaging`, `validation`, `process`, and `internal`. Existing typed errors pass through package boundaries without reclassification. See ADR-0008.

### Validation result
Factorio validation returns structured results with status, normalized runtime error type, concise summary, bounded logs, duration, and process metadata. The artifact boundary converts failed validation results into the shared `ProjectError` taxonomy before they cross into orchestration.

## Factorio validation
The existing `factorio-harness` is the authority for real-runtime validation.

A validation run:
1. creates an isolated temporary directory;
2. validates candidate `info.json` before any file operation: name `[A-Za-z0-9_-]{1,100}`, three-part numeric version, no symlinks inside the candidate, and a destination contained in the run directory;
3. copies the candidate mod into a dedicated `mods/` directory;
4. writes a per-run `config.ini` (`read-data` = the binary's game data, `write-data` = the run directory) passed through `--config`, so concurrent runs never share `write-data`, the lock file, or `script-output`;
5. writes `mod-list.json` that enables `base` and the candidate and explicitly disables the bundled `space-age`, `quality`, and `elevated-rails` mods, because Factorio enables installed-but-unlisted mods by default;
6. runs a pinned Factorio stable 2.0.x headless binary with a timeout and caller cancellation (`SIGKILL` on expiry);
7. captures bounded stdout/stderr/log information;
8. returns structured PASS/FAIL; a lost exclusive-lock race is a `process_error`, not a candidate failure;
9. removes temporary files after completion.

The source candidate is never mutated. The validation environment is therefore genuinely base-game-only. Residual boundary: a candidate could branch on other mods that a player has installed (for example Space Age); that behavior is outside base-game validation and remains a documented limitation of automated success.

## Assertion strategy
For deterministic prototype-stage changes, tests should assert expected prototype state in the Factorio data stage where feasible. A generated mod passing syntax/load validation alone is not sufficient when the requested semantic change can be asserted.

Examples:
- expected prototype exists;
- expected scalar property equals/matches the ModSpec result;
- expected recipe ingredients/results match the specification;
- expected technology prerequisites/cost match the specification;
- newly created machine/entity, item, recipe, ingredient amounts, and unlock technology/effect match the `new_machine` specification;
- newly created custom intermediate items, their recipes/results, and unlock technology/effect match the `new_item` specification, including same-bundle references used by dependent content.

For the current deterministic capabilities, the generator returns semantic assertion Lua separately from the user artifact. During validation, `factorio-harness` materializes a temporary companion validator mod that depends on the candidate and runs the assertion from `data-final-fixes.lua`. Factorio executes the data-stage rounds in the order `data.lua`, `data-updates.lua`, then `data-final-fixes.lua`, so the validator observes the final prototype state in the isolated base+candidate environment.

`prototype_property` assertions compare the final numeric property against the expected absolute value. `recipe_ingredient` assertions find the named item ingredient in the final recipe prototype and compare its `amount` against the expected integer. `recipe_crafting_time` assertions compare final `recipe.energy_required`; `recipe_result` assertions find the reviewed result and compare its amount; `item_stack_size` assertions compare final item `stack_size`. `technology_cost` assertions compare the final `technology.unit.count` against the expected integer. `technology_prerequisite` assertions verify final presence/absence of the reviewed prerequisite edge. `new_machine` assertions verify the new entity/item/recipe and technology unlock, including requested scalar fields, exact recipe ingredients, and new-technology research definition when applicable. Assertion failures use the `__PROJECT_SEMANTIC_ASSERTION__` marker and are normalized as `semantic_assertion_failed`, separately from `factorio_load_failed` and process errors. Validation-only Lua must not be packaged into the installable user artifact. See ADR-0006.

## Deterministic local build command
`pnpm mod:build -- <mod-spec.json> [output-directory]` performs:
1. JSON parse and ModSpec validation;
2. deterministic generation of a bounded manifest and separate semantic assertions;
3. temporary materialization of the candidate;
4. real Factorio load plus semantic validation;
5. ZIP creation only after validation succeeds.

Reference deterministic inputs:
- `examples/faster-steel-furnace.json` — M1 `prototype_property`;
- `examples/cheaper-iron-gears.json` — M2 `recipe_ingredient`;
- `examples/double-automation-research-cost.json` — M2 `technology_cost`;
- `examples/remove-steel-prerequisite.json` — M2 `technology_prerequisite`.
- `examples/fast-start-bundle.json` — M6A `mixed` bundle combining reviewed machine/belt/mining/lab speed, recipe ingredient, and technology cost changes.

## Repair loop
`packages/agent-core` implements bounded Repair around an immutable accepted ModSpec. A Repair call receives:
- the original validated ModSpec;
- the previous bounded `info.json` + `data.lua` manifest;
- a runtime-validated normalized `SerializedProjectError`;
- a provider-agnostic `LlmProvider`;
- a candidate validator that re-runs the Factorio pipeline.

Only `factorio_load_failed` and `semantic_assertion_failed` are Repair-eligible in the current prototype-stage scope. Packaging, process, schema/input, unsupported-scope, and other application/infrastructure errors terminate or return to their owning layer rather than being sent to the model.

The model response schema is exactly `{ "dataLua": string }`. The application replaces only the existing `data.lua` content. The accepted ModSpec, `info.json`, manifest paths/roles, and semantic assertion Lua remain unchanged. Repair cannot add `control.lua`, dependencies, assets, validation files, or any other path.

Every candidate is validated by real Factorio using the original semantic assertion Lua. Because model-authored Lua is not application-owned, a repaired candidate must additionally pass the integrity checks of ADR-0018 through `validateRepairedFactorioMod`:
1. the companion-validator run passes the original assertions;
2. the `data.raw` dump with the validator present equals the dump of the candidate alone, so the code cannot behave differently when it is being checked;
3. the candidate-alone dump differs from the cached base-game dump only inside the footprint the accepted ModSpec allows (named properties of named prototypes, or prototypes the ModSpec creates and the base game lacks).

The four Factorio runs (validator, validator dump, candidate dump, base dump) execute in parallel in isolated directories; the base dump is cached per binary. A violation is a repairable `semantic_assertion_failed` whose `details.addresses` lists up to 20 offending `type/name[.property]` addresses. A candidate is successful only when all checks pass. Deterministic, application-generated artifacts keep the single validator run.

Maximum automatic Repair model attempts: **2 hard cap**. Attempt history captures outcome, provider/model when available, token/cost metadata, duration, normalized validation error, and terminal reason. Non-repairable validation errors terminate immediately rather than consuming a second model attempt. See ADR-0010.

Repair regression evals live under `evals/repair/`. `pnpm repair:eval` injects known load/semantic failures into deterministic artifacts, then runs `failure -> Repair -> real Factorio -> original semantic assertions`. Initial development gate: >=80% repaired cases. Z.ai Coding Plan `glm-5.3-flash` passes 5/5 Repair cases with 5 total attempts; Ollama Cloud remains an alternate tested provider.

## Local end-to-end prototype
`packages/agent-core` exposes `runLocalFactorioGeneration`, which composes existing bounded components rather than replacing them. When `baseModSpec` is present, the planning stage uses the follow-up Revision Planner before continuing through the same downstream pipeline. The flow is:
1. Planner classifies/derives a validated ModSpec;
2. deterministic generator creates the bounded manifest and original semantic assertions;
3. real Factorio validates the candidate;
4. only a `factorio_load_failed` or `semantic_assertion_failed` result may enter the hard-capped Repair loop;
5. the repaired candidate, if any, must pass real Factorio with the original assertions;
6. only then is the installable ZIP written.

`pnpm prompt:build -- "<request>"` is the M5 local user interface. It emits a bounded sequence of structured progress events (`planning`, `generating`, `validating`, optional `repairing`, `packaging`, terminal state), returns one structured terminal result, and uses root `dist/` and `.runs/` by default. Unsupported requests do not generate files. Expected pipeline failures are returned with the shared serialized error contract.

Each run gets a generation ID and a git-ignored `.runs/<generation-id>.json` report containing the original prompt, accepted ModSpec when present, progress, Planner/Repair attempt metadata, aggregate token/optional configured cost metadata, total duration, validation metadata, final ZIP path or terminal typed failure, and optional user feedback. `pnpm prompt:feedback -- <generation-id> <up|down> [note]` updates only the matching bounded report. These local JSON reports are prototype telemetry and must not be treated as the M6 production persistence model.

Recorded M5 live smoke on 2026-10-11 using Z.ai Coding Plan `glm-5.3-flash`: direct supported prompt completed in 5,401 ms, one Planner attempt, 2,215 tokens, 1,540 ms Factorio validation, no Repair, and a validated ZIP under root `dist/`.

Recorded M6A live mixed smoke on 2026-10-11 using the same provider: a four-change prompt (assembling-machine speed, furnace speed, gear ingredient cost, and Automation research cost) produced an exact `mixed` ModSpec on the first Planner attempt and a validated ZIP in 8,086 ms; Factorio validation took 1,599 ms, total model usage was 3,337 tokens, and no Repair was needed.

Recorded M6A throughput smoke on 2026-10-11: “Make iron gears craft twice as fast, make transport belts produce 4 belts per craft, and set electronic circuit stack size to 500” produced the exact three-family `mixed` ModSpec on the first Planner attempt. The validated ZIP completed in **7,957 ms**; Factorio semantic validation took **1,676 ms**, model usage was **4,466 tokens**, and no Repair was needed.


## Private-beta service boundary
`packages/service-core` converts the local M5 flow into an asynchronous service contract without moving Factorio or LLM work into HTTP handlers. The persisted lifecycle is `queued -> running -> succeeded | unsupported | failed`.

Submission rules:
1. validate a bounded prompt;
2. persist a queued generation;
3. enqueue only `{ schemaVersion, generationId }`;
4. return before Planner/Factorio execution.

Worker rules:
1. load the persisted generation by ID;
2. atomically claim `queued -> running` using a monotonically increasing record `revision` and repository compare-and-set semantics;
3. execute through a `GenerationExecutor` adapter;
4. on success, validate a bounded safe ZIP filename/size (currently max 10 MiB), publish bytes through `ArtifactStore`, verify returned key/name/size metadata, and persist the private object reference;
5. otherwise persist `unsupported` or a normalized typed `failed` result;
6. refresh the running record through revision-CAS heartbeats from claim until artifact publication finishes, bounded by `execution + publication + grace` below the pg-boss job expiry;
7. treat terminal redelivery as idempotent and do not execute already-running work again;
8. allow a separate CAS-safe recovery pass to mark genuinely stale running records, and queued records whose pg-boss job is missing or finished, as retryable process failures without silently requeueing them;
9. bound execution and publication with deadlines that cancel LLM requests, Factorio processes and uploads, and delete a published object whose terminal record could not be persisted.

Exact defaults, env variables, and KPI latency definitions are owned by `docs/service-contract.md`.

The service record retains immutable `userId`, prompt, accepted ModSpec when applicable, Planner/Repair attempt metadata, aggregate usage/cost, validation state, typed failures, artifact metadata, a one-time `firstDownloadedAt` funnel marker, and bounded structured user feedback. Revision generations additionally retain `sourceGenerationId` and an internal immutable `baseModSpec` snapshot; both optional fields appear together and remain compatible with existing schema-version-2 records. Public API responses omit the duplicated base snapshot. The persisted generation-record contract is currently `schemaVersion: 2`; the pg-boss generation-job payload remains independently versioned at schema version 1 because its shape did not change when ownership was added. `packages/factorio-service-executor` implements the service executor port by running M5 under a fresh temporary root, returning validated ZIP bytes plus mapped service telemetry, and deleting temporary M5 reports/artifacts before returning. See `docs/service-contract.md` and ADR-0011.

Private-beta adapter defaults from ADR-0012:
- PostgreSQL for durable service state;
- Drizzle ORM with node-postgres for schema/query/migrations;
- pg-boss for asynchronous jobs in the same PostgreSQL deployment;
- private S3-compatible object storage via AWS SDK v3 semantics for validated ZIP artifacts.

Production migrations are versioned Drizzle migrations; schema push at application startup is not the production migration policy. `packages/service-postgres` stores the runtime-validated record JSON alongside indexed id/status/revision/timestamps and performs optimistic updates by revision. API submission can use `PostgresGenerationSubmissionStore`, which inserts the queued row and calls pg-boss `send()` through `fromDrizzle(tx, sql)` inside one transaction. The integration test proves a queue failure rolls the row back. A checksum-pinned PostgreSQL 18.6 source build under `.tools/` is used only for reproducible local integration tests. `packages/service-s3` uploads only runtime-validated ZIP keys/names through AWS SDK v3 PutObject. Generation records persist only private object metadata; downloads are generated on demand as 30–900 second presigned GetObject URLs with attachment filename/content type. Object keys are persisted, while authorization to request a signed URL remains in the API layer. Redis is not part of the initial beta architecture.

Tester transparency/recovery:
- successful public generation JSON includes the accepted typed `modSpec.changes`; revision results derive a bounded public diff from the internal base snapshot without exposing `baseModSpec`;
- `GET /v1/generations?limit=1..20` lists only the authenticated user's newest generations using the existing user/created-at index, so reload does not destroy access to prior downloads/revisions;
- automated success currently means isolated base-game Factorio 2.0.77 validation, not compatibility with arbitrary third-party mod stacks or Space Age.

Private-beta API security:
- users are operator-provisioned with high-entropy opaque bearer tokens; only SHA-256 token hashes are persisted;
- generation reads, feedback, and downloads are owner-scoped by immutable `userId`;
- successful API responses omit internal ownership and object-store key fields;
- per-user and salted-IP fixed-window rate-limit counters live in PostgreSQL; raw IP addresses are not used as bucket keys;
- proxy forwarding headers are trusted only when explicitly configured;
- artifact downloads require ownership and redirect to a short-lived presigned URL. Follow-up revisions are also owner-scoped and only successful source generations are revisable; the source record is never reopened. See ADR-0013 and ADR-0016. `apps/worker` is the executable pg-boss consumer and wires the configured LLM provider, Factorio executor, PostgreSQL repository, and S3 artifact store. Local service integration uses pinned Docker PostgreSQL 18.6 plus Adobe S3Mock 5.2.3 and proves atomic submission -> queue consumption -> real Factorio validation -> S3-compatible upload -> persisted success -> presigned download. The integration Planner is a typed fake provider so this infrastructure test does not spend external LLM quota. The selected beta object-storage provider is SeaweedFS 4.39 on the Helsinki VPS and has passed the deployment upload/presigned-download/delete smoke.

## Package boundaries
Current and planned repository boundaries:
- `packages/domain`: ModSpec, state machine, shared typed errors;
- `packages/factorio-harness`: execute and normalize Factorio validation;
- `packages/factorio-generator`: deterministic ModSpec-to-mod materialization;
- `packages/factorio-knowledge`: versioned Factorio support targets/baselines and Planner-facing capability registry;
- `packages/llm`: provider abstraction;
- `packages/agent-core`: Planner/Generator/Repair orchestration;
- `packages/service-core`: generation lifecycle, API/worker contracts, and infrastructure ports;
- `packages/factorio-service-executor`: M5/Factorio adapter for `GenerationExecutor`;
- `packages/service-postgres`: Drizzle/node-postgres persistence and pg-boss queue adapters;
- `packages/service-s3`: AWS SDK v3 S3-compatible ArtifactStore and presigned-download adapter;
- `apps/worker`: queued generation execution;
- `apps/web`: UI and API.

Factorio-specific logic must not leak into generic orchestration contracts.

## Persistence for service stage
PostgreSQL is the accepted private-beta persistence default. Minimum entities:
- users — implemented as private-beta `service_users`;
- generations — implemented with immutable user ownership;
- generation attempts;
- persisted ModSpec;
- artifacts;
- feedback;
- one per-user private-beta willingness-to-pay survey response.

Each generation attempt should capture model/provider, token/cost data, duration, validation status, and normalized failure type.
Private-beta KPI reporting is computed directly from PostgreSQL. Users marked `metricsEligible=false` (operator/deployment smoke accounts) and all of their generations/surveys are excluded. Repeat usage requires two distinct prompts. KPI reporting also separates successful generations from download starts, structured intent-match feedback, explicit in-game test outcomes, optional issue categories, and a problem-outcome rate that flags either non-`yes` intent match or a `partly`/`failed` in-game result. `reportedFalseSuccessRate` remains a backwards-compatible feedback proxy and must be read with the structured signals.

## Security boundaries
- LLM output does not receive arbitrary shell access.
- Generated paths are relative and validated against traversal/absolute paths.
- External processes have explicit timeouts and bounded captured output.
- Test runs use isolated temporary directories.
- Unsupported online-cheat, anti-cheat, DRM, or binary-patching requests are outside product scope.
- Secrets and API credentials never enter generated mod source or prompts unnecessarily.

## Deployment packaging
- Development/test workspace imports resolve to TypeScript source; production Node processes run with `--conditions=production` and resolve compiled `dist` exports.
- `pnpm build` must include a compiled-runtime resolution smoke for web, worker, migration/KPI, S3 smoke, and repo-local runtime paths.
- Private-beta web and worker are separate Docker targets. The worker image must not embed the Factorio binary; it downloads the official pinned archive with checksum verification into a writable `/app/.tools` path at runtime.
- Hosted S3 compatibility must be proven with upload + presigned download + byte comparison + cleanup against the actual deployment bucket before beta.
- TLS termination and public routing remain outside the Node process; the web process is intended to sit behind a controlled reverse proxy/load balancer.

## Version policy
- Support stable Factorio 2.0.x only during the first MVP.
- A concrete headless patch version is pinned for deterministic development/testing.
- Updating the pinned version requires running integration/eval coverage and recording the change if it affects compatibility or behavior.
- Experimental Factorio branches are unsupported unless a later ADR changes this policy.

## Testing layers
1. Unit tests for schemas, deterministic generators, path validation, and normalization.
2. Integration tests against the real pinned Factorio headless runtime.
3. Golden/eval prompts after LLM Planner/Repair exists.
4. End-to-end tests for prompt-to-ZIP once orchestration exists.

## Definition of a successful generated mod
A result may be presented as successful only when:
- ModSpec is valid and supported;
- generated files pass application safety/static checks;
- Factorio headless validation passes;
- applicable semantic assertions pass;
- artifact packaging succeeds.
