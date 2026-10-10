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

Initial change types:
- `prototype_property`;
- `recipe_change`;
- `technology_change`.

Runtime validation for these contracts lives in `packages/domain` and uses Zod schemas; TypeScript types are inferred from the runtime schemas so validation and static types stay aligned.

### Generated file manifest
The Generator returns a bounded manifest rather than direct filesystem or shell operations:
- relative path;
- textual content;
- optional role/type metadata.

Only allow-listed file names/extensions may be materialized by the application.

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
