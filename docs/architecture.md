# Architecture v0.1

## Product pipeline

`prompt -> planner -> generator -> validator -> Factorio tester -> repair loop -> ZIP`

M0 implements only the Factorio tester boundary. The rest of the pipeline must treat it as a stable contract.

## M0 contract

Input:
- path to a local Factorio mod directory;
- path to a Factorio headless binary;
- optional timeout.

Output:
- `ok: true` when Factorio loads the mod and successfully creates a test map;
- otherwise `ok: false` with exit code, normalized error summary, and bounded logs.

## Isolation

Every run creates a fresh temporary directory containing:
- a dedicated `mods/` directory;
- generated `mod-list.json`;
- a temporary output save.

The supplied mod is copied into that directory. A run never mutates the source mod.

## Version policy

MVP development targets the current Factorio stable 2.0.x line. Experimental branches are not supported. Later releases must be deliberately validated before changing the pinned test version.

## Future package boundaries

- `factorio-harness`: executes and normalizes Factorio validation.
- `domain`: typed ModSpec and generation state contracts.
- `agent-core`: planner, generator, repair orchestration.
- `llm`: provider abstraction.
- `worker`: async job runner.
- `web`: UI/API.
