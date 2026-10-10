# ADR-0004: Typed ModSpec as the intent-to-code boundary

Status: Accepted
Date: 2026-10-10

## Context
Passing a user's free-form prompt directly to a code-generating model makes behavior hard to constrain, test, explain, and repair. The project needs a stable representation of user intent that downstream code can validate independently from LLM behavior.

## Decision
Introduce a typed `ModSpec` intermediate representation between natural-language planning and Factorio code generation.

The Planner converts user intent into ModSpec. Downstream generators, validators, assertions, persistence, and repair logic operate on ModSpec and structured file manifests rather than depending on the original prose prompt.

Initial ModSpec capabilities are intentionally narrow and explicitly typed.

## Alternatives considered
- Prompt directly to Lua — rejected because it couples interpretation and code generation and makes deterministic testing difficult.
- Store only generated files — rejected because the system would lose a machine-readable statement of intended behavior.
- Fully generic AST for every future game — rejected as premature abstraction; ModSpec starts with Factorio requirements and may generalize later.

## Consequences
### Positive
- LLM intent parsing can be evaluated separately from code generation.
- Deterministic generators are possible for common changes.
- Unsupported requests can be rejected before generating code.
- Semantic assertions can be derived from declared intent.
- Repair can be constrained not to silently change user scope.

### Negative / trade-offs
- Capability schemas require deliberate design and maintenance.
- Some creative requests will be unsupported until new ModSpec primitives are added.
- The schema may evolve as real beta requests reveal missing concepts.

## Revisit when
Evolve or partially supersede this decision if real supported use cases cannot be represented without making ModSpec more complex than direct safe generation. Do not bypass ModSpec ad hoc; record the new boundary in an ADR.
