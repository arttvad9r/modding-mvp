# ADR-0015: Compose reviewed capability primitives into mixed tweak bundles

Status: Accepted
Date: 2026-10-11

## Context
The first private-beta implementation proved the end-to-end service, but its product surface was too narrow: a ModSpec could contain multiple changes only when every change belonged to the same capability family. A user asking for a small personal rebalance across machine speed, recipes, and research therefore received `unsupported` even when every individual requested change was already safely supported.

The product-value goal is to let a user describe a small tweak pack and receive one validated mod. Expanding this by allowing the model to write arbitrary Lua would discard the typed intent boundary and validation guarantees established by ADR-0004, ADR-0006, ADR-0009, and ADR-0010.

## Decision
Keep the existing single-family ModSpec variants valid for backward compatibility with persisted generation records, and add a `mixed` ModSpec variant that composes two or more existing typed change families in one immutable specification.

`mixed` is a composition marker, not a new Factorio capability primitive. `factorioCapabilityRegistry` continues to describe only reviewed primitive families and exact allow-listed targets. Each mixed change must independently pass the same registry/support checks as a single-family change.

The Planner may return multiple typed changes from different primitive families. The application, not the model, derives the root ModSpec capability summary (`mixed` when more than one family is present), the fixed Factorio target, and one semantic assertion for every change. If any essential requested change is unsupported, the Planner must return `unsupported`; it must not silently omit the unsupported part and partially fulfill the prompt.

The deterministic generator dispatches each change and assertion by its typed `type` field and emits one bounded `data.lua` plus the existing separate semantic assertion Lua. Real Factorio remains the final validation authority. Repair receives the complete immutable mixed ModSpec and all accepted primitive capability constraints; it remains limited to replacing `data.lua` and cannot alter the accepted bundle.

As the first product-value expansion, the reviewed `prototype_property` allow-list is broadened from furnace `crafting_speed` to selected numeric speed properties on base-game furnaces, assembling machines, mining drills, transport belts, inserters, and labs. Relative operations use baselines taken from the pinned Factorio 2.0.77 runtime.

## Alternatives considered
- Allow the LLM to write arbitrary `data.lua` for compound requests — rejected because it removes deterministic target checking and makes product success depend on unconstrained generated code.
- Replace all existing ModSpec variants with a new incompatible root schema — rejected because persisted private-beta generation records already contain the legacy variants and do not need a migration for composition.
- Add a hard-coded `fast_start` or similar bundle capability — rejected because product value comes from composing primitives chosen by the user, not from maintaining a catalog of named presets.
- Partially fulfill mixed prompts by dropping unsupported changes — rejected because it creates a high-risk false-success mode where the ZIP is valid but does not represent the user's full request.

## Consequences
### Positive
- One request can produce a useful personal tweak pack instead of one microscopic change.
- Existing deterministic generators, semantic assertions, and support registry remain the safety boundary.
- Existing persisted single-family ModSpecs remain valid without a database migration.
- Adding future reviewed primitives increases the useful combination space without adding one bespoke bundle implementation per product idea.

### Negative / trade-offs
- Planner evaluation must now test extraction of multiple changes and exact preservation of all requested parts.
- Repair prompts and UI telemetry must describe multiple accepted capability families rather than assuming one.
- Conflicts between future primitives that touch the same underlying Factorio state will need explicit conflict rules before those combinations are admitted.
- The current first slice is still prototype-stage configuration/rebalance work; it does not add runtime `control.lua` behavior, new assets, or arbitrary new prototypes.

## Revisit when
Revisit when mixed bundles need ordered/conflicting edits to the same semantic address, when iterative editing requires a versioned project-level state model, or when beta evidence justifies moving beyond reviewed prototype-stage primitives.