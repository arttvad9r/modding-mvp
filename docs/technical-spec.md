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
- `technology_cost` — mutation of finite research `unit.count` for an allow-listed base-game technology.

Planned M2 extension:
- technology prerequisite changes.

A single ModSpec uses exactly one capability family. Runtime validation for these contracts lives in `packages/domain` and uses Zod schemas; TypeScript types are inferred from the runtime schemas so validation and static types stay aligned.

For `prototype_property`, `packages/factorio-generator` supports `crafting_speed` on the base-game stone, steel, and electric furnace prototypes. The allow-list stores the pinned base value for each supported address so relative operations such as `multiply` can be converted into an absolute semantic expectation.

For `recipe_ingredient`, M2 initially supports existing item ingredients only. The versioned allow-list stores the recipe, ingredient type/name, and base amount. `set` and `multiply` are supported only when the resulting item amount is an integer in `1..65535`; invalid amounts fail before Factorio execution. The generator locates the named ingredient inside `data.raw["recipe"][recipe].ingredients` and mutates only its `amount`. New ingredients, ingredient removal, fluids, and recipe products are outside this first recipe capability.

For `technology_cost`, M2 supports allow-listed technologies with a finite numeric `unit.count`. Baselines are read from the pinned Factorio 2.0.77 base data. `set` and `multiply` are accepted only when the resulting count is a positive safe integer. Technologies using `count_formula` are intentionally outside this first technology capability.

Official prototype references: `RecipePrototype::ingredients`, `ItemIngredientPrototype::amount`, and `TechnologyUnit::count` in the Factorio prototype documentation.

### Generated file manifest
The Generator returns a bounded manifest rather than direct filesystem or shell operations:
- relative path;
- textual content;
- optional role/type metadata.

The generic manifest contract rejects absolute paths, traversal segments, backslashes, empty path segments, duplicate paths, excessive file counts, and oversized text content. The M1 Factorio artifact layer is stricter still: the installable manifest must contain exactly `info.json` (`metadata`) and `data.lua` (`data_stage`). Files such as `control.lua` or validation-only `data-final-fixes.lua` are rejected.

Materialization occurs only inside a fresh temporary build directory. The candidate is validated there, then packaging creates a ZIP with a single top-level `<mod-name>_<version>/` folder. Validation-only companion mod files never enter the ZIP.

### Validation result
All validation layers return structured results with:
- status;
- stage;
- normalized error type;
- concise error summary;
- bounded raw logs where useful;
- duration.

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

`prototype_property` assertions compare the final numeric property against the expected absolute value. `recipe_ingredient` assertions find the named item ingredient in the final recipe prototype and compare its `amount` against the expected integer. `technology_cost` assertions compare the final `technology.unit.count` against the expected integer. Assertion failures use the `__PROJECT_SEMANTIC_ASSERTION__` marker and are normalized as `semantic_assertion_failed`, separately from `factorio_load_failed` and process errors. Validation-only Lua must not be packaged into the installable user artifact. See ADR-0006.

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
- `examples/double-automation-research-cost.json` — M2 `technology_cost`.

## Repair loop
A Repair step receives:
- original ModSpec;
- previous generated file manifest;
- normalized validation failure;
- narrowly selected Factorio knowledge/context.

Maximum automatic repair attempts for the initial MVP: 2.

A repair may change generated files but must not silently expand the requested ModSpec scope.

## Package boundaries
Planned repository boundaries:
- `packages/domain`: ModSpec, state machine, shared typed errors;
- `packages/factorio-harness`: execute and normalize Factorio validation;
- `packages/factorio-generator`: deterministic ModSpec-to-mod materialization;
- `packages/factorio-knowledge`: curated versioned rules/examples if needed;
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
