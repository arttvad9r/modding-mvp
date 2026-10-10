# Agent development rules

## Product goal
Build a service that turns a natural-language request into a validated, installable Factorio mod.

## Current milestone
M0: Factorio Mod Test Harness.

## Current scope
- Factorio stable 2.0.x only.
- Prototype-stage mods only unless a task explicitly expands scope.
- No asset generation, multiplayer cheats, DRM bypasses, binary patching, marketplace, billing, or multi-game support.
- Project/brand name is not final. Do not hard-code a public brand name.

## Architecture rules
- Keep Factorio-specific behavior inside `packages/factorio-*` packages.
- Prefer typed data contracts over free-form text between components.
- Generated mod code must never receive shell access.
- External processes must have explicit timeouts and bounded output.
- Temporary test runs must use isolated directories.
- Do not modify unrelated files while completing a task.

## Commands
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm factorio:test -- <mod-path>`

## Definition of done
A task is done only when:
1. The requested behavior is implemented.
2. Automated tests cover the important behavior or the task documents why an integration test is required.
3. `pnpm typecheck` passes.
4. `pnpm test` passes.
5. No unrelated refactors are included.
6. Contract or architectural changes are documented.

## Agent workflow
1. Read this file and the files named in the task.
2. Inspect existing behavior before editing.
3. Make the smallest coherent change.
4. Run the relevant narrow tests first, then repository-wide checks.
5. Report changed files, commands run, and unresolved risks.

## Forbidden without an explicit task
- Adding infrastructure services.
- Adding dependencies without a concrete justification.
- Weakening, deleting, or skipping failing tests to make CI green.
- Enabling arbitrary shell/file access for generated mods or LLM output.
- Adding `control.lua` runtime features.
- Supporting experimental Factorio branches.
