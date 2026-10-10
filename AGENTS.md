# Agent development rules

## Product goal
Build a service that turns a natural-language request into a validated, installable Factorio mod.

The public product/brand name is not final. Do not hard-code a public brand name.

## Source of truth
Before making a non-trivial change, read the relevant repository documentation:
- `docs/product-spec.md` — product scope, promise, non-goals, success hypotheses;
- `docs/technical-spec.md` — target contracts, boundaries, validation/security rules;
- `docs/roadmap.md` — milestone sequence and exit criteria;
- `docs/backlog.md` — current engineering tasks;
- `docs/architecture.md` — concise current system map;
- `docs/adr/README.md` and applicable ADRs — decisions that must not be silently reversed.

If code and documentation disagree, do not guess. Report the conflict and make the smallest change needed to restore a single source of truth.

## Current milestone
M2: Expand deterministic Factorio capabilities.

M0 Factorio Mod Test Harness and M1 Deterministic ModSpec engine are complete and should be treated as stable boundaries unless a task explicitly changes their contracts.

## Current scope
- Factorio stable 2.0.x only.
- Prototype-stage mods only unless an accepted ADR expands scope.
- No asset generation, multiplayer cheats, DRM bypasses, binary patching, marketplace, billing, or multi-game support.

## Architecture rules
- Keep Factorio-specific behavior inside `packages/factorio-*` packages.
- Prefer typed data contracts over free-form text between components.
- User prompt must not be passed directly to an unconstrained filesystem/shell-writing agent.
- Generated mod code must never receive shell access.
- External processes must have explicit timeouts and bounded output.
- Temporary test runs must use isolated directories.
- Do not modify unrelated files while completing a task.
- Do not silently bypass ModSpec for supported product generation flows.

## ADR policy
Create or update an ADR when a task changes a durable decision such as:
- game/version strategy;
- package/service boundaries;
- storage or queue technology;
- LLM orchestration contract;
- sandbox/security model;
- validation authority;
- a decision expensive or confusing to reverse later.

Small refactors, implementation details, and patch dependency upgrades normally do not require ADRs.

## Commands
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`
- `pnpm factorio:test -- <mod-path>`

## Definition of done
A task is done only when:
1. The requested behavior is implemented.
2. Automated tests cover important behavior or the task documents why an integration test is required.
3. Relevant narrow tests pass.
4. `pnpm typecheck` passes.
5. `pnpm test` passes.
6. `pnpm test:integration` is run when Factorio/runtime behavior changed.
7. No unrelated refactors are included.
8. Public contracts/specs are updated when behavior changes.
9. ADRs are added/updated when a durable architecture decision changes.

## Agent workflow
1. Read this file, relevant specs, applicable ADRs, and files named in the task.
2. Inspect existing behavior before editing.
3. Confirm the task belongs to the current milestone/backlog; if not, flag the scope change.
4. Make the smallest coherent change.
5. Run relevant narrow tests first, then repository-wide checks required by the task.
6. Report changed files, commands run, unresolved risks, and documentation/ADR impact.

## Forbidden without an explicit task or accepted ADR
- Adding infrastructure services.
- Adding dependencies without concrete justification.
- Weakening, deleting, or skipping failing tests to make CI green.
- Enabling arbitrary shell/file access for generated mods or LLM output.
- Adding `control.lua` runtime features.
- Supporting experimental Factorio branches.
- Adding a second game.
- Introducing marketplace, billing, or social features.
