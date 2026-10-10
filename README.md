# AI modding MVP

Working repository for a prompt-to-mod service. The public product name is intentionally undecided.

## Current milestone

M0 — Factorio Mod Test Harness:

1. Accept a local Factorio mod directory.
2. Run it in an isolated Factorio 2.0.x headless environment.
3. Capture exit status and logs.
4. Return a structured PASS/FAIL result.

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
