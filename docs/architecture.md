# Architecture v0.2

## Current state
M0 is complete: `packages/factorio-harness` validates a candidate mod against pinned Factorio headless 2.0.77 in an isolated temporary environment and returns structured PASS/FAIL.

Current development milestone: M1 — deterministic ModSpec engine.

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

## Current M1 boundary: deterministic ModSpec engine
Implemented:
- `packages/domain` for typed ModSpec contracts;
- `packages/factorio-generator` for deterministic supported ModSpec-to-Lua generation (currently `furnace.crafting_speed`).

Remaining M1 scope:
- semantic assertions derived from ModSpec;
- safe ZIP packaging;
- an end-to-end local command for ModSpec -> generated mod -> Factorio validation -> ZIP.

No LLM is required for M1. This allows generator correctness and the Factorio contract to be established before natural-language planning is introduced.

## Planned package/application boundaries
- `packages/domain`: ModSpec, generation states, shared typed errors.
- `packages/factorio-harness`: executes and normalizes Factorio validation.
- `packages/factorio-generator`: deterministic Factorio artifact generation.
- `packages/factorio-knowledge`: curated versioned rules/examples when needed.
- `packages/llm`: model provider abstraction.
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
