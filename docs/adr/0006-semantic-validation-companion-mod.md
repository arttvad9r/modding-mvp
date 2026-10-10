# ADR-0006: Semantic validation via a temporary companion mod

Status: Accepted
Date: 2026-10-10

## Context
A Factorio mod can load successfully while failing to make the change declared by ModSpec. Static checks and a successful Factorio startup therefore do not prove semantic correctness.

For relative operations such as `multiply`, validation also needs a known base value to derive an absolute expected result. Shipping validation assertions inside the user's generated mod would make test-only code part of the artifact and could create compatibility failures when other mods legitimately alter the same prototype.

## Decision
Keep semantic assertion code separate from the generated user artifact.

For the initial `prototype_property` capability:
- the supported-address registry contains exact base-game prototype/property addresses and their expected base values for the pinned Factorio target;
- the deterministic generator returns mutation Lua plus separate `semanticAssertionLua`;
- `factorio-harness` creates a temporary validator mod only for the validation run;
- the validator mod depends on the candidate mod and executes the assertion in `data-final-fixes.lua`;
- semantic failures contain the `__PROJECT_SEMANTIC_ASSERTION__` marker;
- the harness normalizes that marker to `semantic_assertion_failed`;
- validation-only Lua is not part of the eventual installable user artifact.

The M1 validation environment contains only the Factorio base mod, the candidate generated mod, and the temporary validator mod.

## Rationale
Factorio's data lifecycle executes the prototype-stage rounds as `data.lua`, then `data-updates.lua`, then `data-final-fixes.lua`. A dependent validator mod can therefore inspect prototype state after the candidate mutation and the normal base-game data-stage processing.

Official references:
- https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html
- https://lua-api.factorio.com/latest/auxiliary/mod-structure.html

## Alternatives considered
- Treat successful load as semantic success — rejected because wrong-but-valid code would be reported as working.
- Put assertions directly in the shipped generated mod — rejected because validation code should not affect the user's artifact or mod compatibility.
- Assert immediately after each mutation in `data.lua` — rejected because it would not observe later data-stage changes.
- Use Factorio Instrument Mode — deferred; it adds harness complexity that is unnecessary for the isolated M1 validation environment.

## Consequences
### Positive
- User artifacts remain free of test-only assertions.
- Semantic failures are machine-distinguishable from syntax/load failures.
- Generator behavior can be checked against the real Factorio data lifecycle.
- The same validation pattern can later support recipe and technology assertions.

### Negative / trade-offs
- Relative operations currently require a versioned known baseline.
- The supported registry is intentionally narrow and must be maintained when Factorio data changes.
- The initial result only proves correctness in the isolated base+candidate environment, not compatibility with an arbitrary user's mod set.

## Revisit when
Revisit this decision when support includes modifications relative to third-party mods, arbitrary mod stacks, runtime `control.lua` behavior, or a Factorio version change that invalidates known baselines.
