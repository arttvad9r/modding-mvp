# AI modding MVP

Working repository for a prompt-to-mod service. The public product name is intentionally undecided.

## Product direction
The first MVP targets Factorio stable 2.0.x and aims to turn a supported natural-language request into a validated, installable mod ZIP.

The project deliberately starts with prototype-stage modifications and one game. See [`docs/product-spec.md`](docs/product-spec.md) for scope and non-goals.

## Current status
- M0 — Factorio Mod Test Harness: complete.
- M1 — Deterministic ModSpec engine: complete.
- M2 — Expand deterministic capabilities: complete.
- M3 — Natural-language Planner: complete.
- M4 — Repair loop: next.

M0 validates candidate mods against a real pinned Factorio 2.0.77 Linux headless runtime and returns structured PASS/FAIL results. M1 adds typed ModSpec generation, semantic validation, safe manifests, and installable ZIP packaging. M2 adds four deterministic capability families, a machine-readable Planner-facing registry in `packages/factorio-knowledge`, a 20-fixture real-Factorio E2E corpus, and typed cross-pipeline errors. M3 adds a provider-agnostic LLM boundary, constrained Planner, OpenAI Responses plus OpenAI-compatible Chat Completions transports, Ollama Cloud/Z.ai presets, bounded structured-output retry, and a 24-case golden eval corpus. The recorded Ollama Cloud baseline with `deepseek-v4.1-flash:cloud` passes all 24 classification cases and all 12 supported ModSpec cases. M4 Repair is next.

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
## Plan a natural-language request

Planner runtime selection is configuration-only. Keep API keys in the environment, never in repository files; `.env.example` lists the supported variables.

Ollama Cloud test run:

```bash
LLM_PROVIDER=ollama-cloud \
OLLAMA_API_KEY=... \
pnpm prompt:plan -- "Make steel furnaces twice as fast"
```

Z.ai general/prepaid API test run:

```bash
LLM_PROVIDER=zai \
ZAI_API_KEY=... \
pnpm prompt:plan -- "Make steel furnaces twice as fast"
```

For a Z.ai Coding Plan API key, additionally set `ZAI_API_MODE=coding`; the project then uses the coding-only base URL instead of the general API URL. OpenAI remains available with `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.

The dev/eval defaults are `deepseek-v4.1-flash:cloud` for Ollama Cloud and `glm-5.3-flash` for Z.ai. Override either with `LLM_MODEL` (or the provider-specific model variable).

`prompt:plan` and `planner:eval` automatically load a git-ignored `.env.local` from the repository root when it exists. This is the preferred local-key workflow; copy `.env.example` to `.env.local`, add only local credentials, and never commit the file.

The same provider configuration runs the golden Planner corpus:

```bash
LLM_PROVIDER=ollama-cloud OLLAMA_API_KEY=... pnpm planner:eval
LLM_PROVIDER=zai ZAI_API_KEY=... pnpm planner:eval
```

The default eval gates are 90% classification accuracy and 80% exact supported-ModSpec semantic accuracy. Recorded M3 baseline: Ollama Cloud `deepseek-v4.1-flash:cloud` = 100% classification (24/24) and 100% supported ModSpec accuracy (12/12), 56,399 total tokens. The Z.ai `glm-5.3-flash` run was not scored because the provider returned HTTP 429 / code 1113 (insufficient balance/resource package) for every request.
