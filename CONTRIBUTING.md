# Contributing

This project is deliberately conservative about generated code: prefer typed capabilities, deterministic generation and executable evidence over broader prompt freedom.

## Setup

The repository uses the pinned pnpm version from `package.json`.

```bash
corepack enable
pnpm install
```

Additional integration setup is documented in `README.md` and `docs/README.md`. Real Factorio and PostgreSQL test runtimes are installed under git-ignored `.tools/` by the repository scripts.

## Verification

For ordinary code changes run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:integration` and `pnpm test:service-integration` when touching the Factorio harness, persistence, queue, worker, API, or artifact-storage paths.

## Design rules

- Extend the typed capability/ModSpec model instead of adding arbitrary generated Lua authority.
- Keep retries, repair and resource use explicitly bounded.
- Pin external runtimes/images that are part of reproducible verification.
- Never commit API keys, production credentials, downloaded game binaries, live database contents, or object-store data.
- Record architecture changes in the ADR set when they change trust or deployment boundaries.

Keep pull requests focused and include the commands actually run.
