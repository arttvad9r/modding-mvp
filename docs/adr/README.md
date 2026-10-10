# Architecture Decision Records

ADRs record decisions that materially constrain future implementation. They are not a changelog and should not be created for temporary implementation details.

## Status values
- `Proposed`: under consideration.
- `Accepted`: current decision and default for new work.
- `Superseded`: replaced by a newer ADR.
- `Deprecated`: no longer recommended but not necessarily replaced.

## When an ADR is required
Create or update an ADR when changing one of these categories:
- supported game/version strategy;
- package or service boundaries;
- persistent data model/storage technology;
- LLM orchestration contract;
- security/sandbox model;
- validation authority/runtime strategy;
- queue/deployment architecture;
- a decision that would be expensive or confusing to reverse silently.

Do not create an ADR merely for:
- small refactors;
- library patch upgrades;
- local code style;
- temporary debugging/setup choices.

## Process
1. Copy `0000-template.md` to the next sequential number.
2. Describe context, decision, alternatives, and consequences.
3. Mark it `Proposed` while discussion is open.
4. Mark it `Accepted` when it becomes the project default.
5. If later replaced, mark the old record `Superseded by ADR-XXXX` and link both records.

## Current records
- [ADR-0001: Factorio-first single-game MVP](0001-factorio-first.md)
- [ADR-0002: TypeScript pnpm monorepo](0002-typescript-pnpm-monorepo.md)
- [ADR-0003: Real Factorio headless is the runtime validation authority](0003-factorio-headless-validation.md)
- [ADR-0004: Typed ModSpec as the intent-to-code boundary](0004-typed-modspec.md)
- [ADR-0005: Prototype-stage changes before runtime scripting](0005-prototype-stage-first.md)
- [ADR-0006: Semantic validation via a temporary companion mod](0006-semantic-validation-companion-mod.md)
- [ADR-0007: Machine-readable Factorio capability registry is the Planner scope source](0007-capability-registry-source-of-truth.md)
- [ADR-0008: Typed cross-pipeline error taxonomy](0008-typed-error-taxonomy.md)
