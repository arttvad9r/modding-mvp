# ADR-0007: Machine-readable Factorio capability registry is the Planner scope source

Status: Accepted
Date: 2026-10-10

## Context
The deterministic core now supports multiple capability families and narrow allow-lists inside each family. A future LLM Planner needs to know what requests can be represented safely as ModSpec.

Maintaining supported scope separately in generator code, documentation, and Planner prompt text would create drift. The Planner could then claim support for targets or operations that deterministic generation rejects, or fail to use capabilities already implemented.

## Decision
Create `packages/factorio-knowledge` as the Factorio support-knowledge boundary.

It owns:
- exact allow-listed targets and pinned base values used by deterministic generation/semantic validation;
- lookup/assert functions for supported changes;
- `factorioCapabilityRegistry`, a machine-readable Planner-facing description of capability IDs, operations, constraints, examples, target policy, and supported targets.

`packages/factorio-generator` consumes this package instead of maintaining its own support catalog.

The future Planner must derive supported Factorio scope from this registry. Prompt text may explain the registry, but must not define an independent capability list.

## Rationale
One versioned source of truth keeps Planner classification, deterministic generation, validation baselines, tests, and documentation aligned. It also lets Planner development depend on a knowledge contract without importing Lua-generation implementation details.

## Alternatives considered
- Keep support metadata inside `factorio-generator` — rejected because it couples Planner discovery to code-generation internals.
- Maintain a hand-written capability list only in Planner prompts — rejected because it can silently drift from executable support.
- Put all Factorio knowledge in `packages/domain` — rejected because ModSpec is game-intent schema infrastructure; Factorio target catalogs and baselines are adapter-specific knowledge.

## Consequences
### Positive
- Planner scope can be generated from executable support metadata.
- Generator and Planner use the same target/baseline catalog.
- Factorio-specific knowledge remains behind a Factorio package boundary.
- Adding support has a clear update/test location.

### Negative / trade-offs
- `factorio-knowledge` becomes a versioned dependency that must stay synchronized with the pinned Factorio runtime.
- Registry metadata still requires review when capability semantics change.
- Natural-language examples are guidance, not a substitute for deterministic target validation.

## Revisit when
Revisit if support becomes dynamic per user mod stack, target catalogs become too large for direct Planner context, or a retrieval layer replaces direct registry injection.
