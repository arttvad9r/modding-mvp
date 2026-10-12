# ADR-0019: Multi-game platform direction behind a GameAdapter boundary

Status: Accepted
Date: 2026-10-12
Partially supersedes: [ADR-0001](0001-factorio-first.md)

## Context
ADR-0001 limited the MVP to Factorio and deferred a second game until the Factorio private beta had been evaluated. The product owner has since clarified the intent. The service is a multi-game prompt-to-mod platform; Factorio is game #1, and the next game was planned right after the Factorio launch. Over time the list of games should grow large.

Two facts make waiting for the full Factorio evaluation a poor gate:
- the Factorio audience (about 0.7 M mod downloaders a year) is too small to decide demand for the whole platform;
- the valuable parts of the system are already largely game-neutral: the LLM provider chain, generation lifecycle, queue, storage, auth, rate limits, KPIs, retry and revision flows.

Factorio-specific coupling still leaks into shared layers:
- `packages/domain` hard-codes `game: "factorio"` and the Factorio change union;
- `service-core` imports that schema directly;
- `agent-core` calls `planFactorioPrompt` and `planFactorioRevision`;
- generation records have no `game` field;
- the UI renders Factorio-specific change summaries.

ADR-0001 also anticipated that early abstractions "may later require adjustment for a second game".

## Decision
1. **Platform direction.** The product targets several moddable games. ADR-0001 keeps its *sequencing* (Factorio first, stable 2.0.x only). Its rule that no second adapter may be developed before the Factorio beta criteria are evaluated is superseded.
2. **GameAdapter boundary.** Shared layers (`domain` core, `service-core`, `agent-core` orchestration, `apps/*`) depend on a `GameAdapter` contract, never on a concrete game. Each adapter owns:
   - the game id and supported version line;
   - the knowledge catalog and capability registry;
   - the typed change schema and its ModSpec root;
   - the Planner and Revision prompt scope;
   - the deterministic generator and assertion derivation;
   - the real-runtime validator and its integrity check (ADR-0018 equivalent);
   - packaging;
   - the UI change rendering.

   Generation records and queue processing carry `game`, and existing records default to `factorio`. Planner output stays classification plus typed changes; the application keeps owning files, assertions and Lua or other code, per game.
3. **Validation authority per game.** A game is admitted only if its mods can be validated by a real, automatable runtime, for example a free dedicated or headless server. Static-only validation is not a success claim (ADR-0003 generalized).
4. **Catalog extraction before breadth.** A game's knowledge catalog must be extracted automatically from game data (such as Factorio `data.raw` dumps or Minecraft vanilla registries/data generators), with reviewed allow-list policy layered on top. Hand-maintained catalogs do not scale to many games.
5. **Game #2 is Minecraft Java datapacks**, on one pinned current release:
   - mods are data (JSON plus `.mcfunction`);
   - the official server jar provides a headless validation runtime;
   - the market is far larger than Factorio's.

   Loader-based JAR mods (Fabric/Forge/NeoForge) remain out of scope.
6. **Licensing gate per game.** Before any paid tier, each game's EULA and terms must be checked for running its server or runtime inside a commercial service. Written permission is required where the terms are unclear. For Factorio this is the existing Wube permission item. The gate covers validation and paid features; it does not block free development.
7. **Server-owner tier** (server-side-only modifications for community server operators) is a planned product segment. It is admitted only for games whose server-side mods need no client install and whose licensing gate has passed.

## Alternatives considered
- **Keep ADR-0001 unchanged until Factorio beta data exists** was rejected. It ties the platform decision to one small community and delays the refactor until it is more expensive.
- **Build a generic any-game framework before game #2** was rejected. The boundary is extracted from two concrete games (Factorio, then Minecraft) instead of being designed speculatively.
- **RimWorld or another XML-defs game as #2** was rejected for now. The format fits, but there is no free headless runtime, so validation would be weaker or costly.
- **7 Days to Die, Project Zomboid or Don't Starve Together as #2** was rejected for now. Each has a strong dedicated-server fit and remains a candidate for the following cluster with a shared SteamCMD validator template. Minecraft wins on audience.
- **Minecraft JAR mods** were rejected. Compiled code and loader matrices break the typed-change, application-owned-code model.

## Consequences
### Positive
- Every new game reuses the service, LLM, auth, storage, KPI and revision infrastructure.
- Market evidence comes from several communities instead of one.
- Automated catalog extraction also removes Factorio's main coverage bottleneck (small hand-curated allow-lists).

### Negative / trade-offs
- A refactor of `domain`, `service-core`, `agent-core` and the UI is needed before game #2. It must be behavior-preserving for Factorio and covered by the existing suites.
- Each game adds a runtime, a version policy, a licensing review and an integrity model to maintain.
- Minecraft already has AI datapack generators; differentiation depends on real-runtime validation and the typed-intent boundary.
- Platform policies differ: Modrinth bans mods generated wholly or mostly by AI, and Nexus requires labeling. Generated mods target personal and server use, not marketplace publishing.

## Revisit when
Revisit if the GameAdapter extraction cannot keep Factorio behavior identical, if Minecraft datapacks cannot be validated reliably on the official server, if a licensing review blocks a game, or if early cohorts show the per-game cost exceeds the value of breadth.
