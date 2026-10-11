# ADR-0013: Private beta uses opaque bearer tokens, owned generations, and PostgreSQL rate limits

Status: Accepted
Date: 2026-10-11

## Context
M6 exposes generation state, validated artifacts, and feedback through HTTP. Private-beta requests therefore need a stable tester identity, ownership checks, revocable credentials, and rate limiting before the API can be deployed. The project intentionally avoids adding a full public signup/password/OAuth system or Redis before beta evidence requires them.

## Decision
Private-beta testers are provisioned by an operator as `service_users` records with a stable UUID and label. Each user receives a high-entropy opaque bearer token exactly once. PostgreSQL stores only the SHA-256 token hash; plaintext tokens are not persisted by the service.

Every service generation stores an immutable `userId`. Adding ownership advances the persisted generation-record contract to `schemaVersion: 2`. User-facing GET, feedback, and download operations must resolve the generation through that owner and return not-found semantics for another user's ID. Queue payloads remain generation-ID-only and stay at their independent `schemaVersion: 1`; workers obtain ownership and prompt data from persisted state.

The initial HTTP API uses `Authorization: Bearer <token>`. Artifact object keys are not exposed in normal generation responses. A successful authorized download request receives a short-lived presigned object-store URL.

Basic rate limiting uses PostgreSQL fixed-window counters through the service `RateLimitStore` port. Limits are applied to both the authenticated user and a salted SHA-256 hash of the client IP. Raw client IP addresses are not used as rate-limit keys. Forwarded client-IP headers are trusted only when deployment explicitly enables trusted-proxy mode.

## Alternatives considered
- Public password/email accounts — unnecessary account-recovery and credential-security surface for the first private beta.
- External OAuth/auth SaaS immediately — viable later, but adds vendor/deployment work before the product has testers.
- Redis-backed rate limiting — rejected for the initial beta because PostgreSQL is already required and the expected traffic is small.
- Persist plaintext API tokens — rejected because a database read would immediately expose active credentials.

## Consequences
### Positive
- Each generation and feedback record can be attributed to a stable tester for repeat-usage metrics.
- Stolen database contents do not directly reveal bearer tokens.
- Ownership checks are explicit at the API boundary.
- Rate limiting works across multiple API processes without adding Redis.
- The auth scheme is simple enough to provision 30+ invited testers manually.

### Negative / trade-offs
- Bearer tokens must be delivered to testers securely and cannot be recovered after provisioning; a lost token must be replaced.
- SHA-256 is appropriate only because tokens are randomly generated high-entropy secrets; it must not be reused as a password-hashing design.
- Fixed-window PostgreSQL counters are intentionally simple and can become inefficient at materially larger traffic.
- The first beta has no self-service signup, password reset, OAuth, or session UI.

## Revisit when
Revisit when public signup is needed, beta user administration becomes operationally expensive, external identity providers are required, or API traffic makes PostgreSQL rate-limit counters a measurable bottleneck.
