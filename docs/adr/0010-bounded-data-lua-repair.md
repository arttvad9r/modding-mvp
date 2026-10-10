# ADR-0010: Bounded data.lua-only Repair preserves accepted ModSpec

Status: Accepted
Date: 2026-10-11

## Context
M3 established a constrained Planner that produces a validated ModSpec, while the deterministic Factorio pipeline and semantic assertions remain authoritative downstream. M4 needs a Repair step for generated artifacts that fail real Factorio loading or semantic validation.

Allowing Repair to rewrite the ModSpec, metadata, assertions, arbitrary files, or capability scope would let a model turn a failed implementation into a different request and falsely report success. Infrastructure failures such as packaging or process availability also cannot be corrected by editing generated Lua.

## Decision
Repair orchestration lives in `packages/agent-core` and receives:
- the original validated ModSpec, which is immutable during Repair;
- the previous bounded generated-file manifest;
- a runtime-validated normalized `SerializedProjectError`;
- a provider-agnostic `LlmProvider`;
- a candidate validator supplied by the Factorio pipeline.

Only `factorio_load_failed` and `semantic_assertion_failed` are Repair-eligible in the current prototype-stage scope. Packaging, process, input, schema, unsupported-scope, and other infrastructure/application failures are not sent to the Repair model.

The model output contract is exactly `{ "dataLua": string }`. Repair may replace only the contents of the existing `data.lua`. The application preserves `info.json`, file paths/roles, the ModSpec, and the original semantic assertions. The model cannot add `control.lua`, dependencies, assets, shell commands, validation code, or extra files.

Every candidate is rebuilt as the same bounded manifest and validated again with real Factorio plus the original semantic assertion Lua. A Repair is successful only when that validator passes.

The Repair loop has a hard maximum of two model attempts. Attempt history records outcome, provider/model metadata when available, usage/cost metadata, duration, normalized validation failure, and terminal reason. Non-repairable validation failures terminate immediately instead of consuming another model attempt.

A reusable Repair eval injects known load/semantic faults into deterministic artifacts and executes `failure -> Repair -> real Factorio -> original semantic assertions`. The initial M4 Ollama Cloud `deepseek-v4.1-flash:cloud` baseline repaired 5/5 fixtures across all four capability families, using 5 total model attempts.

## Alternatives considered
- Let Repair modify the ModSpec — rejected because semantic scope changes require replanning/user-visible intent changes, not silent repair.
- Let Repair return a complete file manifest — rejected because it unnecessarily expands the model's filesystem authority.
- Let Repair replace semantic assertions — rejected because the model could make its own broken output pass.
- Retry every error code through the model — rejected because packaging/process failures are infrastructure concerns and editing Lua cannot reliably fix them.
- Allow unbounded iterative repair — rejected because cost, latency, and termination must remain predictable.

## Consequences
### Positive
- Repair cannot silently broaden or change accepted user intent.
- Existing Factorio runtime and semantic validation remain the success authority.
- Attempts terminate deterministically after at most two model calls.
- Repair behavior is provider-independent and observable through typed history/usage metadata.
- Multi-provider Repair evals can reuse the same fault corpus.

### Negative / trade-offs
- The current Repair cannot fix legitimate problems that require metadata/dependency changes or another generated file.
- A failure caused by a wrong ModSpec must be replanned rather than repaired.
- The `data.lua`-only contract is intentionally narrower than future runtime-script or multi-file capabilities may require.

## Revisit when
Revisit if accepted capabilities add `control.lua`, assets, multiple generated code files, mod dependencies, or another game whose safe repair unit is not a single data-stage file. Any expansion must preserve an immutable intent boundary and application-owned validation assertions.
