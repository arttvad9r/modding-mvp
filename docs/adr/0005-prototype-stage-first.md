# ADR-0005: Prototype-stage changes before runtime scripting

Status: Accepted
Date: 2026-10-10

## Context
Factorio mods can change prototype data during the data stage or implement runtime behavior with `control.lua` and event-driven state. Runtime systems introduce more complex lifecycle, save-state, event, multiplayer, and behavioral testing requirements.

## Decision
The first MVP capability set is limited to prototype-stage modifications. Runtime `control.lua` features are explicitly out of scope until the prototype-stage pipeline is reliable and private-beta evidence justifies expanding capability.

## Alternatives considered
- Support prototype and runtime mods immediately — rejected because the testing and safety surface would expand before the basic product loop is validated.
- Runtime-only scripting — rejected because many useful deterministic balance/recipe/technology modifications can be delivered more simply in the data stage.

## Consequences
### Positive
- Smaller generation surface and simpler semantic assertions.
- Faster real-runtime tests.
- Lower risk of persistent/save-state bugs.
- Easier capability allow-listing and deterministic generation.

### Negative / trade-offs
- Many creative mod ideas remain unsupported initially.
- The early product must clearly communicate its capability limits.

## Revisit when
Consider runtime scripting after M1-M6 evidence shows strong reliability for prototype-stage generation and user demand contains repeated high-value requests that genuinely require `control.lua`.
