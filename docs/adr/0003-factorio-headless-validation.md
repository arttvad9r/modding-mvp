# ADR-0003: Real Factorio headless is the runtime validation authority

Status: Accepted
Date: 2026-10-10

## Context
Static Lua checks and hand-written API mocks cannot reliably prove that a generated Factorio mod actually loads against the targeted game version. The product promise depends on distinguishing a plausible code snippet from a mod that the game accepts.

## Decision
Use the real pinned Factorio stable 2.0.x headless runtime as the authoritative integration validator for generated mods.

Each run executes in an isolated temporary mod directory with explicit timeout and bounded log capture. Static checks may reject bad input earlier, but they do not replace real runtime validation.

## Alternatives considered
- Lua parser/linter only — rejected because valid Lua can still use invalid Factorio prototypes or APIs.
- Mock Factorio APIs — rejected as the primary authority because mocks can drift from the real game.
- User-only manual testing — rejected because it would weaken the core product promise and make automated repair impractical.

## Consequences
### Positive
- Validation is grounded in the actual target runtime.
- Real error logs can drive deterministic normalization and later repair loops.
- Version compatibility is measurable rather than assumed.

### Negative / trade-offs
- Integration tests require the Factorio headless runtime and are slower than unit tests.
- Runtime distribution/use terms must remain compatible with the deployment model.
- Full behavioral correctness can still require semantic assertions beyond successful load.

## Revisit when
Reconsider only if Factorio provides a more authoritative supported validation API/tool, or if deployment/legal constraints prevent using headless for the intended service workflow.
