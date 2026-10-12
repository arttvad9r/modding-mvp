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
- `recipe_crafting_time` — `set` / `multiply` crafting time for reviewed recipes;
- `recipe_result` — `set` / `multiply` existing reviewed item result amounts;
- `item_stack_size` — `set` / `multiply` stack size for reviewed base-game items;
- `technology_cost` — `set` / `multiply` finite allow-listed technology `unit.count`;
- `technology_prerequisite` — reviewed `add` / `remove` prerequisite edges;
- `new_machine` — `create` a new machine from one reviewed base-game template (`assembling-machine-2`, `assembling-machine-3`, `chemical-plant`, `oil-refinery`, `centrifuge`, `electric-furnace`, `electric-mining-drill`, `lab`), including its item, recipe, and existing/new technology unlock; the template's speed property is `crafting_speed`, `mining_speed`, or `researching_speed`; custom graphics are not generated and the inherited base assets are reused;
- `new_recipe` — `create` a new alternative item-only recipe for a reviewed existing base-game result item or a `new_item` declared in the same bundle, with reviewed/same-bundle ingredients and an existing/new technology unlock;
- `new_item` — `create` a new intermediate item cloned from a reviewed non-placeable base item template, including its own item-only recipe and existing/new technology unlock; same-bundle `new_machine` / `new_recipe` changes may consume it.

All current entries target Factorio stable `2.0` and are validated against the pinned development runtime `2.0.77`. A ModSpec may compose two or more of these typed families under the root `mixed` marker; `mixed` itself is intentionally not a capability-registry entry. Every contained change is checked against its primitive registry entry independently.

## Code boundaries
- `packages/factorio-knowledge/src/supported.ts` owns exact supported targets, baseline values, and lookup/assert functions.
- `packages/factorio-knowledge/src/capabilities.ts` derives Planner-facing metadata from those same allow-lists.
- `packages/factorio-generator` consumes `@project/factorio-knowledge`; it does not own a separate support catalog.

Adding a capability or supported target requires updating the knowledge catalog and tests. Planner prompts must not introduce support that is absent from this registry.

See ADR-0007, ADR-0015, and ADR-0017.
