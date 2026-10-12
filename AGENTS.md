# Agent development rules

Service that turns a natural-language request into a validated, installable game mod; Factorio is game #1 of a planned multi-game platform (ADR-0019). Public brand name is not final; do not hard-code one.

## Sources of truth
- Product scope: `docs/product-spec.md`; technical contracts/security: `docs/technical-spec.md`; current sequence: `docs/roadmap.md`; tasks: `docs/backlog.md`; capabilities: `docs/capabilities.md`; architecture: `docs/architecture.md`; durable decisions: `docs/adr/`.
- Read only documents relevant to the task. If code and an accepted contract disagree, establish which is stale instead of silently inventing a third behavior.
- Current work is M6 private beta; M6B content-mod capability exists. Exact deployed commit/provider/eval counts and rollout history belong in git/deployment docs, not this file.

## Product scope
- Factorio stable 2.0.x, prototype/data-stage mods within accepted capabilities.
- Additional games only through the GameAdapter boundary and per-game gates of ADR-0019 (real validation runtime, extracted catalog, licensing review); game #2 is Minecraft Java datapacks.
- No asset generation, multiplayer cheats, DRM bypass, binary patching, marketplace or billing unless an accepted decision expands scope.

## Architecture and security invariants
- Factorio-specific behavior stays in `packages/factorio-*`. Supported capability definitions come from `@project/factorio-knowledge`; do not duplicate them in prompts.
- HTTP handlers never run Planner, Factorio or Repair inline. Queue payloads contain only generation ID; persisted generation state is authoritative.
- Production Node entrypoints use compiled `dist` exports. Do not bake/redistribute Factorio binary in project images; worker may fetch the official checksum-pinned headless runtime into cache.
- Planner output is classification + typed changes only. Application owns targets/assertions/files/Lua. Follow-up revisions return the complete resulting typed change set and create immutable new generation records.
- Control flow branches on typed `ProjectError.code`, never parsed human error text. Repair is limited to allowed validation failures and cannot change ModSpec/metadata/assertions/paths or add files.
- Prefer typed contracts. User prompts/generated code never receive unconstrained shell/filesystem access. External processes require timeouts and bounded output; temp runs use isolated directories.
- User-visible records are owner-scoped by immutable `userId`. Persist only hashes of private-beta bearer tokens; never log/echo secrets. Raw client IPs are not persisted for rate limiting.
- Do not silently bypass ModSpec or weaken validation/security to make a generation succeed.

## Commands
- Core: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Runtime/integration when relevant: `pnpm test:integration`, `pnpm factorio:test -- <mod-path>`, `pnpm test:service-integration`, `pnpm test:container-images`, `pnpm s3:smoke`.
- Planner/repair: `pnpm planner:eval`, `pnpm repair:eval`, `pnpm prompt:plan -- "<request>"`, `pnpm prompt:build -- "<request>"`.
- Service/database operations are documented in package/deployment docs; do not run production-impacting commands merely because they appear in historical instructions.

## Definition of done
- Requested behavior is implemented through the real product path; important behavior has appropriate tests; targeted checks and `pnpm typecheck`/`pnpm test` pass.
- Run Factorio/runtime integration only when that behavior changed. Update public contracts/specs when behavior changes and ADR only for durable architectural decisions.
- Avoid unrelated refactors and dependencies without concrete justification. Never delete/weaken failing tests to get green output.

## Workflow
Inspect existing behavior, read the relevant contract/ADR, make the smallest coherent change, run narrow checks then the required broader gate, and report only changed behavior, verification and real remaining risks.
