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
- `docs/capabilities.md` — Factorio capability registry/source-of-truth rules;
- `docs/architecture.md` — concise current system map;
- `docs/adr/README.md` and applicable ADRs — decisions that must not be silently reversed.

If code and documentation disagree, do not guess. Report the conflict and make the smallest change needed to restore a single source of truth.

## Current milestone
M6: Private beta (in progress). M6A Minimum Interesting Product is complete. M6B Content Mods is now the active pre-beta value milestone: expand the validated data-stage product from rebalance-only tweaks into creation of reviewed new game content before public ingress and the first external cohort. M6B supports bounded new intermediate items, alternative item recipes, and cloned production/research machines with existing/new technology unlocks; custom items may feed other created recipes/machines in the same bundle.

M0 through M5 are complete and should be treated as stable boundaries unless a task explicitly changes their contracts. M6 has started with `packages/service-core`: API submission persists `queued` state and enqueues only a generation ID; workers claim `queued -> running`, execute through a `GenerationExecutor`, publish successful artifacts through `ArtifactStore`, and persist one terminal state. `packages/factorio-service-executor` is the real Factorio implementation of that executor port and must preserve M5 validation/Repair guarantees. `packages/service-postgres` implements revision-CAS persistence plus pg-boss queueing and atomic record+job submission; its integration test runs against a checksum-pinned local PostgreSQL 18.6 runtime. `packages/service-s3` implements private ZIP upload plus bounded presigned download URLs through AWS SDK v3 S3 semantics. Generation queue retries are disabled; ADR-0014 requires explicit owner-triggered retries to create a fresh generation rather than reopening terminal state. ADR-0011 through ADR-0017 are accepted defaults. The first M6 deployment is live on the Helsinki VPS using `infra/compose.beta.yaml`: pinned PostgreSQL 18.6, pinned SeaweedFS 4.39, persistent volumes, worker concurrency 1, and tailnet-only HTTPS through Tailscale Serve. Hosted S3 smoke and live `glm-5.3-flash` server E2Es have passed. M6B Content Mods is complete. The live Planner corpus now covers 53 EN/RU supported/unsupported cases and `glm-5.3-flash` passes 53/53 classification plus 34/34 exact supported ModSpecs. The deterministic data-stage surface includes the seven rebalance families plus `new_item`, `new_recipe`, and `new_machine`, including same-bundle custom-item dependency graphs such as Reinforced Plate → Reinforced Furnace. The current MyModz runtime/UI is deployed tailnet-only on the home server from source commit `f2f1ae6`; it includes M6B content mods, beta-learning instrumentation, and the tested provider-failover runtime. The deployed worker now reports Ollama Cloud `glm-5.3-flash` as primary with Z.ai Coding Plan `glm-5.3-flash` fallback. A live production-container Ollama prompt → Factorio → ZIP smoke completed in 3.773 s with no Repair, and an isolated forced-primary-failure smoke returned successfully through Z.ai. Full typecheck/unit/build/real-Factorio/service E2E, live UI/health, apps-health, and host `verify-stack` are green. A live linked content-tree prompt produced a real-Factorio-validated ZIP in 18.484 s without Repair. Operator smoke users are explicitly excluded from product KPIs; the deployed KPI baseline is zero real testers. Public ingress for off-tailnet testers is still pending.

## Current scope
- Factorio stable 2.0.x only.
- Prototype-stage mods only unless an accepted ADR expands scope.
- No asset generation, multiplayer cheats, DRM bypasses, binary patching, marketplace, billing, or multi-game support.

## Architecture rules
- Keep Factorio-specific behavior inside `packages/factorio-*` packages.
- HTTP/API handlers must not run Planner, Factorio, or Repair inline; use the service queue/worker boundary from ADR-0011.
- Service queue payloads contain only the versioned generation ID; persisted generation state is authoritative.
- Private-beta infrastructure defaults to PostgreSQL + Drizzle/node-postgres + pg-boss and private S3-compatible artifact storage per ADR-0012.
- Production Node entrypoints must use compiled `dist` exports via the `production` package condition; do not deploy `tsx` source execution as the private-beta runtime.
- Do not bake or redistribute the Factorio binary in project container images; the worker runtime may fetch the official checksum-pinned headless archive into a writable cache volume.
- Planner-supported Factorio scope must come from `@project/factorio-knowledge`; do not duplicate a separate capability list in prompts.
- Planner LLM output is limited to classification plus typed changes; target/assertions/Lua/files are application-owned.
- Follow-up Revision Planner output is the complete resulting typed change set, never a Lua/file patch; source generations remain immutable and revisions create new generation records per ADR-0016.
- Planner/Repair control flow must branch on typed `ProjectError.code`, not parse human error-message text.
- Repair must not change ModSpec, metadata, semantic assertions, file paths, or add files; current model output is replacement `data.lua` only.
- Repair is limited to `factorio_load_failed` and `semantic_assertion_failed` and at most two model attempts.
- Prefer typed data contracts over free-form text between components.
- User prompt must not be passed directly to an unconstrained filesystem/shell-writing agent.
- Generated mod code must never receive shell access.
- External processes must have explicit timeouts and bounded output.
- Temporary test runs must use isolated directories.
- Do not modify unrelated files while completing a task.
- Do not silently bypass ModSpec for supported product generation flows.
- User-facing generation access must be owner-scoped by immutable `userId`; another user's generation ID must not disclose the record.
- Private-beta bearer tokens are high-entropy secrets; persist only their SHA-256 hashes and never log/token-echo them outside explicit provisioning output. Provision operator/smoke users as metrics-ineligible so product KPI reports contain only real testers.
- Raw client IP addresses must not be persisted for rate limiting; use the deployment-salted hash contract from ADR-0013.

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
- `pnpm postgres:setup`
- `pnpm factorio:test -- <mod-path>`
- `pnpm prompt:plan -- "<request>"`
- `pnpm planner:eval`
- `pnpm repair:eval`
- `pnpm prompt:build -- "<request>"`
- `pnpm prompt:feedback -- <generation-id> <up|down> [note]`
- `pnpm test:service-integration`
- `pnpm test:container-images`
- `pnpm s3:smoke`
- `pnpm beta:kpis`
- `pnpm worker:start`
- `pnpm api:start`
- `pnpm db:migrate`
- `pnpm beta:user:create -- "<label>"`
- `pnpm beta:user:create -- --internal "<operator/smoke label>"`

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
