# ADR-0002: TypeScript pnpm monorepo

Status: Accepted
Date: 2026-10-10

## Context
The project will contain a web/API surface, workers, shared domain contracts, Factorio-specific generation/validation packages, and LLM orchestration. Development is performed heavily with AI coding agents, so explicit package boundaries and one consistent language/toolchain are valuable.

## Decision
Use a TypeScript monorepo managed with pnpm workspaces for application and orchestration code.

Packages expose typed contracts and tests. Factorio-generated mods remain Lua artifacts; this ADR does not require runtime game code to be TypeScript.

## Alternatives considered
- Multiple repositories — rejected at MVP stage because cross-package contract changes would add coordination overhead.
- Python backend — viable, but rejected to keep frontend, API, worker, schemas, and tooling in one primary language.
- Polyglot microservices — rejected as premature operational complexity.

## Consequences
### Positive
- Shared types across pipeline boundaries.
- One dependency and test workflow for AI agents.
- Atomic commits for contract + consumer changes.
- Easy extraction into services later if evidence requires it.

### Negative / trade-offs
- Repository discipline is required to prevent accidental coupling.
- TypeScript is not inherently suited to every future workload; specialized tooling may later justify another language.

## Revisit when
Reconsider if a component has a demonstrated requirement that TypeScript cannot meet cleanly, or if deployment/ownership boundaries justify extracting repositories or services.
