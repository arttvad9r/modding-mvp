# ADR-0017: Add reviewed recipe-time, recipe-result, and item-stack rebalance primitives

Status: Accepted
Date: 2026-10-11

## Context
M6A already composes reviewed machine-speed, recipe-ingredient, and research changes into one validated tweak bundle and supports immutable follow-up revisions. The remaining product-value gap is breadth: many common personal rebalance requests concern how long a recipe takes, how many items it outputs, and how many items fit in one inventory stack.

Those requests can remain inside the existing typed prototype-stage safety model. They do not require arbitrary Lua, new prototypes, `control.lua`, assets, or a new service boundary.

## Decision
Add three new primitive ModSpec families: `recipe_crafting_time`, `recipe_result`, and `item_stack_size`. All use the existing scalar `set`/`multiply` operations and are composable under `mixed` like the earlier families.

`packages/factorio-knowledge` owns exact reviewed targets and pinned Factorio 2.0.77 baselines. The first allow-list covers simple base-game recipes/items used by early-game tweak packs. Recipe-result support is limited to existing reviewed item results; adding/removing results and fluid-result edits remain unsupported. Item stack sizes and item result amounts are bounded to integers in `1..65535`. Recipe crafting time is bounded to `0.001..3600` seconds.

Factorio recipes whose source prototype omits `energy_required` are treated using the engine default baseline `0.5`; deterministic generation writes the final explicit value before semantic validation. Every new change receives a matching application-owned semantic assertion and must pass the pinned real Factorio runtime before ZIP publication.

Planner and Revision Planner output remains typed changes only. Their registry-derived prompts expose the new families, while title/slug/target/assertions/Lua/files remain application-owned. Unsupported compound requests remain all-or-unsupported.

## Alternatives considered
- Model these values as arbitrary generic prototype-property edits — rejected because recipe results are nested and because explicit product-facing families give clearer address validation, Planner semantics, and constraints.
- Allow arbitrary recipe result rewrites — rejected because adding/removing results substantially broadens semantic and compatibility risk.
- Let the LLM patch `data.lua` directly for these requests — rejected because it bypasses the typed intent and semantic-validation boundaries.

## Consequences
### Positive
- Personal tweak bundles can now cover throughput, recipe yield, and inventory-density changes that are materially more useful than isolated machine-speed edits.
- The implementation reuses the existing registry, deterministic generator, mixed composition, revision flow, Repair boundary, and real-runtime validation.
- Exact allow-lists keep the support surface reviewable and expandable from beta evidence.

### Negative / trade-offs
- The Planner schema and eval corpus become larger, increasing prompt/token cost.
- Default-valued Factorio fields such as omitted `energy_required` require explicit baseline handling rather than naive direct multiplication.
- The initial result/stack target set is intentionally narrow and will still return unsupported for many valid Factorio prototypes.

## Revisit when
Revisit when beta evidence justifies broader recipe products, fluids, productivity-sensitive semantics, stack sizes beyond the current reviewed set, or a more generic safe prototype-address abstraction.