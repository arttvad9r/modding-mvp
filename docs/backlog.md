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

## M1 — next

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
- [ ] Design a semantic assertion mechanism for data-stage prototype state.
- [ ] Generate an assertion from `prototype_property` ModSpec.
- [ ] Integrate assertion failure into structured harness result.
- [ ] Add fixture proving load-success but semantic-failure is detected.

### Packaging and command flow
- [ ] Add safe generated file manifest contract.
- [ ] Materialize manifest only under a temporary build directory.
- [ ] Package installable Factorio ZIP with correct top-level folder.
- [ ] Add a local command for `ModSpec JSON -> validated ZIP`.
- [ ] Add end-to-end deterministic integration tests.

## M1 exit review
Before starting M2:
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:integration`.
- [ ] Run `pnpm build`.
- [ ] Review package boundaries against `technical-spec.md`.
- [ ] Add/update ADRs for any architecture decision made during M1.
- [ ] Confirm at least five ModSpec fixtures pass through the real Factorio runtime.

## M2 candidates
Do not start these until M1 exit criteria are met unless explicitly reprioritized:
- recipe mutation capability;
- technology cost capability;
- technology prerequisite capability;
- richer Factorio error taxonomy;
- capability registry/metadata;
- larger deterministic eval corpus.

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
