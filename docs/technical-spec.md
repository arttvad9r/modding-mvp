# Technical specification v0.1

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
- capability identifier.

Implemented capability-specific ModSpec variants:
- `prototype_property` — scalar mutation of an allow-listed prototype property;
- `recipe_ingredient` — amount mutation of an existing allow-listed item ingredient in an existing base-game recipe;
- `technology_cost` — mutation of finite research `unit.count` for an allow-listed base-game technology;
- `technology_prerequisite` — add/remove one reviewed prerequisite edge between base-game technologies.

A single ModSpec uses exactly one capability family. Runtime validation for these contracts lives in `packages/domain` and uses Zod schemas; TypeScript types are inferred from the runtime schemas so validation and static types stay aligned.

For `prototype_property`, `packages/factorio-generator` supports `crafting_speed` on the base-game stone, steel, and electric furnace prototypes. The allow-list stores the pinned base value for each supported address so relative operations such as `multiply` can be converted into an absolute semantic expectation.

For `recipe_ingredient`, M2 initially supports existing item ingredients only. The versioned allow-list stores the recipe, ingredient type/name, and base amount. `set` and `multiply` are supported only when the resulting item amount is an integer in `1..65535`; invalid amounts fail before Factorio execution. The generator locates the named ingredient inside `data.raw["recipe"][recipe].ingredients` and mutates only its `amount`. New ingredients, ingredient removal, fluids, and recipe products are outside this first recipe capability.

For `technology_cost`, M2 supports allow-listed technologies with a finite numeric `unit.count`. Baselines are read from the pinned Factorio 2.0.77 base data. `set` and `multiply` are accepted only when the resulting count is a positive safe integer. Technologies using `count_formula` are intentionally outside this first technology capability.

For `technology_prerequisite`, M2 supports only reviewed technology/prerequisite pairs. Each pair permits exactly one baseline-aware `add` or `remove` operation; arbitrary graph edits are rejected before Factorio execution.

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

Ollama Cloud uses JSON mode plus application-side Zod validation/retry; strict provider-native structured outputs are not assumed. For reasoning-capable Ollama models used by the Planner, the preset requests `reasoning_effort: none` so the JSON answer remains in assistant content instead of being split into reasoning output. Z.ai defaults to prompt-only JSON plus the same application validation so Planner correctness does not depend on undocumented response-format behavior. API keys are read only from environment/runtime configuration and are never persisted in prompts or repository files.

### Planner contract
`packages/agent-core` owns natural-language planning. It consumes the machine-readable Factorio registry and a provider-agnostic `LlmProvider` from `packages/llm`. The model must not emit Lua, file manifests, target metadata, or semantic assertions.

A supported model response contains only title, kebab-case slug, one capability family, and typed changes. An unsupported response contains a reason. The application derives the fixed Factorio stable 2.0 target and matching semantic assertions, validates the result through `ModSpecSchema`, then verifies every change against `packages/factorio-knowledge`.

Malformed or registry-invalid model output receives at most one correction retry by default. Planner calls retain provider, model, token, duration, and optional estimated-cost metadata. The first provider adapter uses the OpenAI Responses API JSON response format through native `fetch`; provider/model choice is configuration. See ADR-0009.

Golden Planner evals live under `evals/planner/`. The initial gate is >=90% supported/unsupported classification accuracy and >=80% exact semantic change accuracy on supported cases. These thresholds are development gates, not product KPI claims. The Planner schema prompt explicitly enumerates the exact JSON shape for each capability-specific change so model quality is measured against a fully specified typed contract rather than implicit TypeScript knowledge.

Recorded M3 live baseline on 2026-10-11: Ollama Cloud `deepseek-v4.1-flash:cloud` passed 24/24 classification cases and 12/12 supported semantic ModSpec cases, using 54,824 input tokens and 1,575 output tokens (56,399 total). An attempted Z.ai `glm-5.3-flash` run returned HTTP 429 / provider code 1113 (`Insufficient balance or no resource package`) for every case and is therefore not treated as model-quality evidence.

For M3 development/evaluation, provider presets use `glm-5.3-flash` on Z.ai and `deepseek-v4.1-flash:cloud` on Ollama Cloud by default. These are dev/eval defaults only; provider/model selection remains runtime configuration and is not a production architecture commitment.

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
2. copies the candidate mod into a dedicated `mods/` directory;
3. writes the required mod list/configuration;
4. runs a pinned Factorio stable 2.0.x headless binary with a timeout;
5. captures bounded stdout/stderr/log information;
6. returns structured PASS/FAIL;
7. removes temporary files after completion.

The source candidate is never mutated.

## Assertion strategy
For deterministic prototype-stage changes, tests should assert expected prototype state in the Factorio data stage where feasible. A generated mod passing syntax/load validation alone is not sufficient when the requested semantic change can be asserted.

Examples:
- expected prototype exists;
- expected scalar property equals/matches the ModSpec result;
- expected recipe ingredients/results match the specification;
- expected technology prerequisites/cost match the specification.

For the current deterministic capabilities, the generator returns semantic assertion Lua separately from the user artifact. During validation, `factorio-harness` materializes a temporary companion validator mod that depends on the candidate and runs the assertion from `data-final-fixes.lua`. Factorio executes the data-stage rounds in the order `data.lua`, `data-updates.lua`, then `data-final-fixes.lua`, so the validator observes the final prototype state in the isolated base+candidate environment.

`prototype_property` assertions compare the final numeric property against the expected absolute value. `recipe_ingredient` assertions find the named item ingredient in the final recipe prototype and compare its `amount` against the expected integer. `technology_cost` assertions compare the final `technology.unit.count` against the expected integer. `technology_prerequisite` assertions verify final presence/absence of the reviewed prerequisite edge. Assertion failures use the `__PROJECT_SEMANTIC_ASSERTION__` marker and are normalized as `semantic_assertion_failed`, separately from `factorio_load_failed` and process errors. Validation-only Lua must not be packaged into the installable user artifact. See ADR-0006.

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

## Repair loop
`packages/agent-core` implements bounded Repair around an immutable accepted ModSpec. A Repair call receives:
- the original validated ModSpec;
- the previous bounded `info.json` + `data.lua` manifest;
- a runtime-validated normalized `SerializedProjectError`;
- a provider-agnostic `LlmProvider`;
- a candidate validator that re-runs the Factorio pipeline.

Only `factorio_load_failed` and `semantic_assertion_failed` are Repair-eligible in the current prototype-stage scope. Packaging, process, schema/input, unsupported-scope, and other application/infrastructure errors terminate or return to their owning layer rather than being sent to the model.

The model response schema is exactly `{ "dataLua": string }`. The application replaces only the existing `data.lua` content. The accepted ModSpec, `info.json`, manifest paths/roles, and semantic assertion Lua remain unchanged. Repair cannot add `control.lua`, dependencies, assets, validation files, or any other path.

Every candidate is validated by real Factorio using the original semantic assertion Lua. The Factorio generator exposes `validateGeneratedFactorioMod` so repaired bounded manifests use the same validation authority without packaging first. A candidate is successful only when that validation passes.

Maximum automatic Repair model attempts: **2 hard cap**. Attempt history captures outcome, provider/model when available, token/cost metadata, duration, normalized validation error, and terminal reason. Non-repairable validation errors terminate immediately rather than consuming a second model attempt. See ADR-0010.

Repair regression evals live under `evals/repair/`. `pnpm repair:eval` injects known load/semantic failures into deterministic artifacts, then runs `failure -> Repair -> real Factorio -> original semantic assertions`. Initial development gate: >=80% repaired cases. Recorded M4 live baseline on 2026-10-11 with Ollama Cloud `deepseek-v4.1-flash:cloud`: 5/5 repaired (100%), 5 total model attempts, 3,483 input + 481 output tokens = 3,964 total.

## Package boundaries
Planned repository boundaries:
- `packages/domain`: ModSpec, state machine, shared typed errors;
- `packages/factorio-harness`: execute and normalize Factorio validation;
- `packages/factorio-generator`: deterministic ModSpec-to-mod materialization;
- `packages/factorio-knowledge`: versioned Factorio support targets/baselines and Planner-facing capability registry;
- `packages/llm`: provider abstraction;
- `packages/agent-core`: Planner/Generator/Repair orchestration;
- `apps/worker`: queued generation execution;
- `apps/web`: UI and API.

Factorio-specific logic must not leak into generic orchestration contracts.

## Persistence planned for service stage
Minimum entities:
- users;
- generations;
- generation attempts;
- persisted ModSpec;
- artifacts;
- feedback.

Each generation attempt should capture model/provider, token/cost data, duration, validation status, and normalized failure type.

## Security boundaries
- LLM output does not receive arbitrary shell access.
- Generated paths are relative and validated against traversal/absolute paths.
- External processes have explicit timeouts and bounded captured output.
- Test runs use isolated temporary directories.
- Unsupported online-cheat, anti-cheat, DRM, or binary-patching requests are outside product scope.
- Secrets and API credentials never enter generated mod source or prompts unnecessarily.

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
