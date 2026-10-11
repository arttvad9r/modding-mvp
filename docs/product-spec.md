# Product specification v0.4

## Purpose
Build a service that turns a natural-language request into a validated, installable Factorio mod for a user who does not need to know Lua or the Factorio mod API.

The public product name is intentionally undecided.

## MVP promise
For a supported request, the user should be able to:
1. describe the desired Factorio change in natural language;
2. receive a generated mod package;
3. know whether the mod passed automated validation in a real Factorio headless runtime;
4. download and install the resulting ZIP.

The product must prefer an explicit unsupported/failed result over claiming that an unverified mod works.

## Initial target
- Game: Factorio.
- Game line: stable 2.0.x only.
- Development runtime is pinned to a specific validated patch release.
- Initial mod scope: prototype-stage changes.

## Initial supported capability families
The first usable MVP should cover a narrow set of deterministic changes:
- prototype property changes, such as crafting speed or other scalar properties;
- recipe ingredient/result changes plus reviewed recipe crafting-time changes;
- technology cost and prerequisite changes;
- item stack-size changes for reviewed base-game items;
- similarly structured changes that can be represented safely in a typed ModSpec.

Exact properties and prototype types are allow-listed as capabilities are implemented and tested.

## Minimum interesting product before external beta
The first service implementation proved the generation/validation infrastructure but was too narrow to justify external recruitment. Before the 30+ tester beta, the product should behave as a personal tweak-pack builder rather than a one-property code generator.

M6A requirements:
- one prompt may contain multiple supported typed changes across different capability families;
- the result is one installable ZIP with semantic validation for every requested change;
- supported prototype-property scope includes reviewed speed parameters for furnaces, assembling machines, mining drills, transport belts, inserters, and labs, in addition to the existing recipe/research primitives;
- unsupported parts of a compound request must cause an explicit unsupported result rather than silent partial fulfillment;
- a user can revise an accepted successful tweak bundle through a follow-up request without learning or editing Lua; each revision is a new generation and the source result remains immutable;
- reviewed recipe crafting time, existing recipe result amounts, and item stack sizes are available as typed primitives for common throughput/inventory rebalance bundles;
- broad/category wording is fail-closed when completeness cannot be proven; users must name exact targets instead of receiving a silent allow-list subset;
- successful results expose the exact accepted change list and follow-up revisions expose a derived diff;
- authenticated testers can reopen recent generations after reload and continue a successful bundle;
- tester-facing copy states that automated validation covers isolated base-game Factorio 2.0.77 only, not arbitrary third-party mod stacks or Space Age compatibility.

`mixed` is a ModSpec composition marker, not an unconstrained generation mode: every contained change must still be an allow-listed typed primitive. Follow-up editing uses the same rule: the Revision Planner returns the complete resulting typed bundle, while the application preserves metadata and revalidates the whole result.

## Explicit non-goals for the first MVP
- runtime `control.lua` gameplay systems;
- generated textures, sound, 3D assets, or other media;
- multiplayer cheats, anti-cheat interference, DRM bypass, or binary patching;
- Minecraft, RimWorld, Terraria, or any second game;
- marketplace or social features;
- Steam Workshop publishing;
- complex billing or subscriptions;
- desktop or mobile apps.

## Core user flow
`prompt -> understand request -> generate -> validate -> repair if needed -> package -> download -> optional follow-up revision -> feedback`

A request outside the current capability set returns `unsupported` with a concise explanation rather than attempting an unbounded generation.

## Quality principles
- Real validation is part of the product, not an optional developer check.
- False success is worse than an explicit failure.
- Generated output must be reproducible from persisted inputs and attempts where practical.
- Repair loops are bounded.
- Generated mod code never receives arbitrary host shell access.

## MVP success hypotheses
These are working product hypotheses to test during private beta, not established market facts:
- >= 80% overall success for prompts inside the declared supported capability set;
- >= 60% success without a repair attempt;
- <= 2 automatic repair attempts per generation;
- median prompt-to-result time <= 3 minutes;
- false-success rate < 5%;
- at least 30 private beta testers;
- at least 10 testers create a second mod;
- at least 3 testers demonstrate willingness to pay.

## Product telemetry required before monetization
For every generation record:
- requested capability;
- outcome and failure stage;
- number of attempts;
- duration per stage;
- LLM token usage and estimated cost when LLMs are introduced;
- Factorio test duration;
- user feedback on whether the downloaded mod worked.

Pricing decisions should be based on this observed unit economics and user behavior rather than assumed cost per generated mod.

### Beta KPI measurement conventions
- Only users explicitly eligible for product metrics are included. Operator/deployment smoke accounts are excluded together with their generations, feedback, and survey responses.
- An active tester has submitted at least one generation.
- A repeat tester has submitted at least two **distinct prompts**; an explicit retry of the same prompt does not count as a second mod.
- Supported terminal success rate is `succeeded / (succeeded + failed)`; `unsupported` requests are reported separately rather than weakening the supported-set denominator.
- Direct-success rate uses the same denominator and counts only succeeded generations whose validation telemetry reports no Repair.
- `reportedFalseSuccessRate` is the share of succeeded generations with feedback that received `down`/"Needs work" feedback. It is a product-signal proxy, not ground-truth false-success, and must always be read together with succeeded-feedback coverage.
- Willingness to pay is an explicit per-user beta survey (`yes | maybe | no`); the initial hypothesis is reached only by `yes` responses.
