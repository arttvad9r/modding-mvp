# ADR-0008: Typed cross-pipeline error taxonomy

Status: Accepted
Date: 2026-10-10

## Context
The deterministic pipeline originally mixed structured Factorio harness failures with ordinary JavaScript `Error` exceptions from input parsing, support checks, generation, and packaging. Callers therefore had to inspect error-message text to distinguish unsupported requests from malformed ModSpecs, generator bugs, packaging failures, or runtime validation failures.

The natural-language Planner and later Repair loop need stable machine-readable failure categories. Error strings remain useful for humans but must not be the control-flow contract.

## Decision
Define the shared public error contract in `packages/domain` as `ProjectError` plus stable `code`, `stage`, `message`, `retryable`, and optional bounded `details`.

Initial error codes:
- `input_error`;
- `schema_error`;
- `unsupported_capability`;
- `generation_error`;
- `packaging_error`;
- `factorio_load_failed`;
- `semantic_assertion_failed`;
- `process_error`;
- `internal_error` as a last-resort unexpected fallback.

Stages are independently represented as `input`, `planning`, `generation`, `packaging`, `validation`, `process`, or `internal`.

Rules:
- existing `ProjectError` values pass through boundaries without being reclassified;
- Zod input-contract failures normalize to `schema_error`;
- `factorio-knowledge` uses `unsupported_capability` for requests outside reviewed support scope;
- deterministic generator failures use `generation_error`;
- manifest/materialization/ZIP failures use `packaging_error`;
- Factorio harness keeps `factorio_load_failed`, `semantic_assertion_failed`, and `process_error` distinct;
- CLI JSON exposes serialized public fields, not stack traces or raw causes;
- message text is diagnostic only and must not be parsed to drive Planner/Repair control flow.

## Rationale
A small stable taxonomy lets the future Planner reject unsupported requests cleanly and lets Repair decide which failures are potentially repairable without coupling orchestration to Factorio log wording or JavaScript exception strings.

Keeping the contract in `packages/domain` avoids creating Factorio-specific dependencies in generic orchestration code while still allowing Factorio packages to use domain error codes.

## Alternatives considered
- Continue throwing ordinary `Error` and parse message prefixes — rejected because wording changes would silently break control flow.
- Give every package its own unrelated error enum — rejected because orchestration would need package-specific adapters for basic error handling.
- Persist full exception objects/stacks as the public contract — rejected because they are unstable, implementation-specific, and may expose unnecessary internal data.

## Consequences
### Positive
- Planner, Repair, CLI, and later API/worker layers can branch on stable codes.
- Unsupported scope is distinguishable from a generator defect.
- Factorio semantic failures remain distinguishable from load/process failures.
- Public error serialization is bounded and does not expose stack/cause by default.

### Negative / trade-offs
- New pipeline stages must intentionally choose a code/stage rather than throwing arbitrary errors across a public boundary.
- The taxonomy will need versioned expansion if later runtime capabilities introduce materially new failure families.

## Revisit when
Revisit if persistence/API versioning requires a formal wire schema, if multi-game support needs game-specific subcodes, or if observed repair behavior needs finer-grained retryability semantics.
