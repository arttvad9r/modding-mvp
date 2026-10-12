# ADR-0018: Repaired Lua must match the installed environment and stay inside the ModSpec footprint

Status: Accepted
Date: 2026-10-12

## Context
ADR-0010 lets the Repair model replace `data.lua` and treats "real Factorio + original semantic assertions pass" as success. The 2026-10-11 audit (A02) showed that this is not enough for model-authored Lua:

- the companion validator mod is present during checking but absent after installation, so Lua that detects the validator (`mods[...]`, a marker prototype) can satisfy assertions only while it is being checked;
- assertions check the requested properties only, so a repair could also change unrelated prototypes (for example, other furnaces or recipes) and still pass.

Deterministic generator output is application-owned and reviewed; repaired output is not. The validation authority must therefore prove more about repaired candidates without weakening Repair's existing bounds.

## Decision
`validateRepairedFactorioMod` in `packages/factorio-generator` is the only success authority for Repair candidates. A candidate succeeds only when all of the following hold:

1. **Assertions.** The candidate passes the original application-owned assertions through the companion validator (unchanged from ADR-0006/0010).
2. **Same behavior with and without the validator.** The `data.raw` dump of `base + candidate + validator` is identical to the dump of `base + candidate`. The second dump is the installed environment.
3. **Footprint.** The installed dump differs from the base-game dump only inside the footprint derived from the accepted ModSpec:
   - named top-level properties of named existing prototypes, such as `furnace/steel-furnace.crafting_speed`, `recipe/X.ingredients` or `technology/X.effects` for an unlock;
   - whole prototypes the ModSpec creates (`new_item`, `new_recipe`, `new_machine`, a new unlock technology), allowed only when the base game does not already have that `type/name`.

Comparison uses per-prototype, per-property SHA-256 digests of canonical JSON from Factorio's `--dump-data`. The base-game fingerprint is cached per Factorio binary, and the independent runs execute in parallel in isolated directories.

The validation environment is base-game-only: bundled `space-age`, `quality` and `elevated-rails` are explicitly disabled.

A violation is a repairable `semantic_assertion_failed` with up to 20 offending addresses in `details.addresses`, so the bounded Repair loop can still correct it within its two-attempt cap. Deterministic generator artifacts keep the single validator run.

## Alternatives considered
- **Static Lua inspection** (forbid `mods`, `script`, string patterns) was rejected. Lua is dynamic, and the runtime dump is the observable truth.
- **Asserting every prototype property in Lua** was rejected. It would duplicate the dump comparison inside Factorio and be slower and harder to bound.
- **Disabling Repair** was rejected. It would discard a measured success path. The integrity check closes the false-success gap at the cost of about three extra parallel Factorio runs per repaired candidate.
- **Running validation without the companion mod and asserting from outside** was rejected. Semantic assertions need the data stage; comparing against the installed dump achieves the same independence.

## Consequences
### Positive
- A repaired ZIP behaves in the installed environment exactly as it did under validation.
- Repairs cannot silently broaden scope beyond the accepted ModSpec, matching ADR-0010's intent at runtime level.
- All 34 supported golden ModSpecs produce no false positives against the footprint, and both audit reproductions are rejected.

### Negative / trade-offs
- Repaired candidates cost roughly four Factorio runs instead of one. They run in parallel, but CPU use per Repair rises.
- A dump-format change between Factorio versions requires re-verifying the fingerprint and footprint mapping.
- The check covers the base-game environment only. Lua that branches on other mods a player has installed, such as Space Age, remains outside automated validation, as the UI already states.

## Revisit when
Revisit when a new capability family changes properties outside today's footprint mapping, when Repair may emit files other than `data.lua`, when validation expands to DLC or mod-stack environments, or when a second game adapter needs an equivalent installed-environment comparison (see ADR-0019).
