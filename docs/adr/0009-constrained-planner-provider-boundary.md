# ADR-0009: Constrained Planner behind a provider-agnostic JSON boundary

Status: Accepted
Date: 2026-10-11

## Context
M2 established a deterministic `ModSpec -> validated ZIP` pipeline and a machine-readable Factorio capability registry. M3 introduces an LLM only to interpret natural-language intent.

Allowing the model to emit Lua, files, arbitrary Factorio identifiers, or a complete duplicated ModSpec would reintroduce nondeterminism downstream and make provider changes difficult to evaluate.

## Decision
The Planner is a constrained orchestration layer in `packages/agent-core` and depends on a provider-agnostic `LlmProvider` contract from `packages/llm`.

The model returns a minimal JSON planner draft:
- supported/unsupported classification;
- for supported requests: title, slug, one capability family, and typed changes;
- for unsupported requests: a concise reason.

The model does not return target metadata, semantic assertions, Lua, file manifests, or shell operations. The application derives the fixed Factorio target and matching assertions deterministically, validates the resulting object through `ModSpecSchema`, and verifies every change against `packages/factorio-knowledge`.

Planner scope is built from `factorioCapabilityRegistry`; no separate prompt-only capability list is allowed.

Malformed or unsupported structured model output receives at most one correction retry by default (two total attempts). Provider/model/token/cost metadata is retained for every successful provider response.

`packages/llm` may contain multiple provider adapters. `packages/agent-core` must not depend on a provider-specific SDK or HTTP response shape.

The first concrete adapter uses the OpenAI Responses API through native `fetch`. A second generic OpenAI-compatible Chat Completions transport supports alternate providers such as Ollama Cloud and Z.ai. Provider/model/base URL selection remains runtime configuration, not an architecture decision.

## Alternatives considered
- Ask the LLM to write Lua directly — rejected because the deterministic generator is the trusted code-generation boundary.
- Ask the LLM for the complete ModSpec including assertions — rejected because assertions duplicate change semantics and can drift from the requested change.
- Put OpenAI-specific calls directly in Planner code — rejected because provider choice should remain replaceable and evals should run against multiple providers later.
- Accept invented targets and let Factorio fail — rejected because unsupported scope should be identified before code generation/runtime validation.

## Consequences
### Positive
- LLM influence ends at a small typed intent boundary.
- Downstream deterministic generation remains unchanged.
- Provider adapters can be swapped without rewriting Planner logic; golden evals can compare providers using the same corpus.
- Registry changes automatically affect Planner scope.
- Malformed model output is bounded and observable.
- Golden prompt evals can compare classification and semantic changes independent of title/slug wording.

### Negative / trade-offs
- A request spanning multiple capability families is currently classified unsupported rather than split into multiple ModSpecs.
- The Planner prompt can become larger as the registry grows and may later need capability retrieval rather than full injection.
- JSON mode still requires application-side schema validation; provider-native strict schema output can be added later without changing the Planner contract.

## Revisit when
Revisit when multi-capability requests are supported, registry size materially affects token cost, a second game is introduced, or provider-native strict structured output is proven portable enough to become part of the generic provider contract.
