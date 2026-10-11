# Factorio capability registry

The machine-readable source of truth for currently supported Factorio generation scope lives in `packages/factorio-knowledge`.

## Purpose
The future natural-language Planner must discover supported scope from `factorioCapabilityRegistry` rather than from a separately maintained list embedded in an LLM prompt.

The registry publishes, for each capability:
- capability/change identifier;
- supported Factorio target/version policy;
- permitted operation types;
- concise constraints;
- prompt examples;
- exact allow-listed targets and pinned baseline values needed by deterministic generation/validation.

## Current capabilities
- `prototype_property` — `set` / `multiply` reviewed numeric speed properties on furnaces, assembling machines, mining drills, transport belts, inserters, and labs;
- `recipe_ingredient` — `set` / `multiply` existing allow-listed item ingredient amounts;
- `technology_cost` — `set` / `multiply` finite allow-listed technology `unit.count`;
- `technology_prerequisite` — reviewed `add` / `remove` prerequisite edges.

All current entries target Factorio stable `2.0` and are validated against the pinned development runtime `2.0.77`. A ModSpec may compose two or more of these primitive families under the root `mixed` marker; `mixed` itself is intentionally not a capability-registry entry. Every contained change is checked against its primitive registry entry independently.

## Code boundaries
- `packages/factorio-knowledge/src/supported.ts` owns exact supported targets, baseline values, and lookup/assert functions.
- `packages/factorio-knowledge/src/capabilities.ts` derives Planner-facing metadata from those same allow-lists.
- `packages/factorio-generator` consumes `@project/factorio-knowledge`; it does not own a separate support catalog.

Adding a capability or supported target requires updating the knowledge catalog and tests. Planner prompts must not introduce support that is absent from this registry.

See ADR-0007 and ADR-0015.
