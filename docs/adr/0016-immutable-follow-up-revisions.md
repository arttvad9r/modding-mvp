# ADR-0016: Follow-up edits create immutable revision generations

Status: Accepted
Date: 2026-10-11

## Context
M6A mixed ModSpecs make one prompt capable of producing a useful tweak bundle, but users still had to restate the whole bundle to change one detail. The product needs an iterative workflow without turning persisted generation records into mutable projects or allowing the model to patch generated Lua directly.

A follow-up request also has to preserve the existing safety boundary: all unchanged intent must survive the edit, unsupported additions must not be silently dropped, and the final result must pass the same deterministic generation, semantic assertions, and real-Factorio validation as a fresh request.

## Decision
A follow-up edit is submitted only from an owner-scoped successful generation. It creates a new generation; the source generation is never reopened or overwritten.

The new queued generation persists two optional revision-context fields alongside its follow-up prompt: `sourceGenerationId` and an immutable `baseModSpec` snapshot copied from the successful source. They must appear together. The pg-boss job remains `{ schemaVersion: 1, generationId }`; workers reload all revision context from durable generation state.

The Revision Planner receives the accepted base ModSpec as application-owned data plus the user's follow-up instruction. Its supported output is the **complete resulting typed change set**, not a delta and not Lua. It must preserve unchanged tweaks, omit a tweak only when the user explicitly removes/restores it, and return `unsupported` rather than partially applying an unsupported follow-up. Relative wording such as “another 25% faster” is interpreted relative to the current accepted bundle.

The application preserves the base title, slug, and Factorio target, derives the resulting single-family or `mixed` capability marker, regenerates one semantic assertion per resulting change, validates all targets against the capability registry, and then runs the normal Generator -> Factorio -> optional bounded Repair -> ZIP pipeline.

Revision context is internal. Public generation JSON may expose `sourceGenerationId` for lineage but omits the duplicated `baseModSpec` snapshot. Existing generation `schemaVersion: 2` records remain valid because the two revision fields are optional additive metadata; no SQL migration is required for the existing JSONB record storage.

## Alternatives considered
- Mutate the source generation in place — rejected because it destroys reproducibility, artifact lineage, feedback history, and queue idempotency assumptions.
- Ask the model for a small patch/delta and apply it directly to generated Lua — rejected because it bypasses typed ModSpec intent and semantic-address validation.
- Concatenate the old natural-language prompt with the follow-up prompt — rejected because prompt text is not an authoritative representation of the accepted typed intent and becomes increasingly ambiguous across edits.
- Introduce a separate mutable “project” table immediately — deferred because immutable generation lineage is sufficient for the current beta and avoids new persistence/infrastructure complexity.

## Consequences
### Positive
- Users can iteratively refine a validated tweak bundle without learning Lua or restating every existing tweak.
- Every revision has a complete typed intent snapshot and its own validated artifact/telemetry.
- Existing queue payloads, PostgreSQL tables, retry semantics, and old generation records remain compatible.
- A revision can itself become the source of another revision, producing a simple auditable lineage.

### Negative / trade-offs
- `baseModSpec` duplicates typed intent in the child generation record.
- Revision Planner quality needs separate regression/live evaluation because preservation and removal semantics differ from first-pass planning.
- Lineage is currently single-parent generation history, not a named mutable project with branches, labels, or collaborative state.
- Natural-language relative edits still rely on the Planner to compute the correct resulting typed operation; semantic validation proves the emitted result, not that an ambiguous phrase matched every possible user interpretation.

## Revisit when
Revisit when users need branching/version browsing, named persistent mod projects, merging revisions, editing non-successful drafts, or conflict resolution between multiple changes targeting the same semantic address.
