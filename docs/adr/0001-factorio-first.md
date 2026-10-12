# ADR-0001: Factorio-first single-game MVP

Status: Accepted; partially superseded by [ADR-0019](0019-multi-game-platform-direction.md) (the "no second game adapter before the Factorio beta criteria are evaluated" rule)
Date: 2026-10-10

## Context
The long-term concept can support multiple moddable games, but each game introduces a different API, version matrix, packaging format, validation environment, and failure taxonomy. The immediate product risk is whether prompt-to-working-mod can be made reliable enough to be useful.

## Decision
The first MVP supports Factorio only. No second game adapter is developed before the Factorio private-beta criteria are evaluated.

The initial supported version line is stable Factorio 2.0.x; experimental branches are out of scope.

## Alternatives considered
- Start with Factorio and RimWorld together — rejected because it doubles game-specific integration before the core product hypothesis is validated.
- Start with Minecraft — rejected for the first MVP because of stronger AI-mod tooling competition and a larger loader/version matrix.
- Build a generic any-game framework first — rejected because abstractions would be designed without validated concrete requirements.

## Consequences
### Positive
- Smaller compatibility and testing surface.
- Faster iteration on the core generation/validation loop.
- Game-specific knowledge can be made precise before generalization.

### Negative / trade-offs
- Early market evidence comes from one game/community.
- Some early abstractions may later require adjustment for a second game.

## Revisit when
Reconsider after Factorio private beta provides evidence on reliability, repeat usage, cost, and willingness to pay, or if Factorio-specific constraints make the product hypothesis impossible to test fairly.
