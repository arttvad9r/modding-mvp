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

## M2 — in progress

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

### Remaining M2 candidates
- [ ] Technology prerequisite capability.
- [ ] Richer Factorio error taxonomy.
- [ ] Capability registry/metadata for Planner discovery.
- [ ] Expand deterministic eval corpus to >=20 fixtures.

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
