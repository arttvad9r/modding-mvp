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

## M3 — in progress
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
- [x] Add ADR-0009 for the constrained Planner/provider boundary.
- [ ] Configure Ollama Cloud and/or Z.ai runtime API keys locally and run the golden eval corpus.
- [ ] Reach classification accuracy >= 90%.
- [ ] Reach supported ModSpec accuracy >= 80%.
- [ ] Review failed golden cases before declaring M3 complete.

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
