# Architecture v0.9

## Current state
M0 is complete: `packages/factorio-harness` validates a candidate mod against pinned Factorio headless 2.0.77 in an isolated temporary environment and returns structured PASS/FAIL.

M1, M2, M3, and M4 are complete. The deterministic core has four capability families, a Planner-facing Factorio capability registry, 20 real-runtime E2E fixtures, and a typed cross-pipeline error taxonomy. The natural-language Planner records a 24/24 classification and 12/12 supported-ModSpec Ollama baseline. Repair is bounded to `data.lua`, preserves accepted intent and original semantic assertions, and records a 5/5 real-Factorio live Repair baseline. M5 local end-to-end orchestration is next.

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
- `packages/factorio-generator` for deterministic supported ModSpec-to-Lua generation across prototype property, recipe ingredient, technology cost, and reviewed technology prerequisite changes;
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
- The LLM returns only supported/unsupported plus title/slug/capability/typed changes.
- Fixed target metadata and semantic assertions are derived deterministically before `ModSpecSchema` validation.
- Unsupported/invented registry targets are rejected before deterministic generation.
- Planner structured-output correction is bounded to two attempts by default.
- `evals/planner/golden.json` and `pnpm planner:eval` provide repeatable model evaluation.
- For Ollama reasoning models used as JSON planners, the adapter can request `reasoning_effort: none`; this avoids reasoning/content splits while application-side Zod validation remains authoritative.
- Recorded M3 live baseline: Ollama Cloud `deepseek-v4.1-flash:cloud` = 100% classification and 100% supported ModSpec accuracy on the 24-case corpus.

## Implemented Repair boundary
- `packages/agent-core` accepts the original immutable ModSpec, previous bounded manifest, normalized runtime error, provider, and candidate validator.
- Only `factorio_load_failed` and `semantic_assertion_failed` are eligible for model Repair.
- Model output is exactly a replacement `data.lua`; `info.json`, file paths/roles, ModSpec, and semantic assertions remain application-owned.
- Repair has a hard two-attempt cap and records attempt outcome, provider/model, usage/cost metadata, duration, error, and terminal reason.
- `packages/factorio-generator` exposes real-Factorio validation for an arbitrary bounded generated manifest while reusing its original semantic assertions.
- `evals/repair/golden.json` plus `pnpm repair:eval` exercise injected failures through Repair and real Factorio.
- Recorded M4 live baseline: Ollama Cloud `deepseek-v4.1-flash:cloud` repaired 5/5 cases using 5 total attempts and 3,964 model tokens.

## Planned package/application boundaries
- `packages/domain`: ModSpec, generation states, shared typed errors.
- `packages/factorio-harness`: executes and normalizes Factorio validation.
- `packages/factorio-generator`: deterministic Factorio artifact generation.
- `packages/factorio-knowledge`: versioned Factorio support targets/baselines and Planner-facing capability registry.
- `packages/llm`: model provider abstraction plus OpenAI Responses and OpenAI-compatible Chat Completions transports/presets.
- `packages/agent-core`: Planner/Repair orchestration.
- `apps/worker`: asynchronous generation jobs when a service requires them.
- `apps/web`: UI/API when local end-to-end behavior is proven.

## Architecture invariants
- Factorio-specific behavior stays behind Factorio package boundaries.
- ModSpec is the typed intent boundary; see ADR-0004.
- Generated files are materialized from a bounded manifest, not by granting an LLM shell access.
- Real Factorio validation cannot be replaced by a static-only success claim.
- External execution is isolated, timed out, and bounded.
- Initial capability scope remains prototype-stage only; see ADR-0005.

Detailed requirements live in `technical-spec.md`; durable rationale lives in `docs/adr/`.
