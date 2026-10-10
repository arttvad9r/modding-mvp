# Project documentation

This directory is the durable project memory for human and AI-agent development.

## Read order for new contributors/agents
1. [`product-spec.md`](product-spec.md) — what the product is and is not.
2. [`technical-spec.md`](technical-spec.md) — target pipeline, contracts, security, validation.
3. [`architecture.md`](architecture.md) — concise current architecture map.
4. [`roadmap.md`](roadmap.md) — milestone sequence and exit criteria.
5. [`backlog.md`](backlog.md) — current implementation tasks.
6. [`adr/README.md`](adr/README.md) — accepted architecture decisions.

## Document responsibilities
- Product behavior/scope changes belong in `product-spec.md`.
- Technical contracts and system-wide engineering requirements belong in `technical-spec.md`.
- `architecture.md` should remain a compact description of what exists and the intended package boundaries.
- Milestone order and gates belong in `roadmap.md`.
- Actionable tasks belong in `backlog.md`.
- Durable decisions and their trade-offs belong in ADRs.

Avoid copying the same detailed rule into several files. Link to the owning document instead.

## Change discipline
Documentation is part of the implementation. A code change that alters a documented public contract, milestone scope, or accepted architecture decision is incomplete until the corresponding document is updated.
