# AI modding MVP

Working repository for a prompt-to-mod service. The public product name is intentionally undecided.

## Product direction
The first MVP targets Factorio stable 2.0.x and aims to turn a supported natural-language request into a validated, installable mod ZIP.

The project deliberately starts with prototype-stage modifications and one game. See [`docs/product-spec.md`](docs/product-spec.md) for scope and non-goals.

## Current status
- M0 — Factorio Mod Test Harness: complete.
- M1 — Deterministic ModSpec engine: complete.
- M2 — Expand deterministic capabilities: complete.
- M3 — Natural-language Planner: next.

M0 validates candidate mods against a real pinned Factorio 2.0.77 Linux headless runtime and returns structured PASS/FAIL results. M1 adds typed ModSpec generation, semantic validation, safe manifests, and installable ZIP packaging. M2 adds four deterministic capability families, a machine-readable Planner-facing registry in `packages/factorio-knowledge`, a 20-fixture real-Factorio E2E corpus, and typed cross-pipeline errors. M3 will map natural-language requests into supported typed ModSpecs without changing the deterministic downstream pipeline.

## Documentation
Start with [`docs/README.md`](docs/README.md).

Key documents:
- [`docs/product-spec.md`](docs/product-spec.md) — product specification;
- [`docs/technical-spec.md`](docs/technical-spec.md) — technical specification;
- [`docs/architecture.md`](docs/architecture.md) — current architecture;
- [`docs/roadmap.md`](docs/roadmap.md) — milestone plan;
- [`docs/backlog.md`](docs/backlog.md) — actionable engineering backlog;
- [`docs/capabilities.md`](docs/capabilities.md) — Factorio capability registry;
- [`docs/adr/README.md`](docs/adr/README.md) — architecture decision records.

AI coding agents must also follow [`AGENTS.md`](AGENTS.md).

## Setup

```bash
pnpm install
pnpm factorio:setup
```

The setup script downloads the pinned Factorio 2.0.77 Linux headless build, verifies its SHA-256 checksum, and stores it under the git-ignored `.tools/` directory.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

## Test a mod manually

```bash
pnpm factorio:test -- /absolute/or/relative/path/to/mod
```

A successful run prints structured `PASS`; a Factorio load failure prints structured `FAIL` with a normalized error summary.

## Build a deterministic mod

```bash
pnpm mod:build -- examples/faster-steel-furnace.json dist
pnpm mod:build -- examples/cheaper-iron-gears.json dist
pnpm mod:build -- examples/double-automation-research-cost.json dist
pnpm mod:build -- examples/remove-steel-prerequisite.json dist
```

The examples cover a prototype scalar property, an existing recipe item ingredient amount, a finite technology research-unit count, and a reviewed technology prerequisite edit. The command validates the ModSpec, generates only allow-listed files in a temporary build directory, runs Factorio plus semantic assertions, and writes an installable ZIP only after validation passes.
