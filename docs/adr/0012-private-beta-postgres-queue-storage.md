# ADR-0012: Private beta uses PostgreSQL + pg-boss + Drizzle and S3-compatible artifact storage

Status: Accepted
Date: 2026-10-11

## Context
M6 needs durable generation records, asynchronous jobs, feedback, and artifact storage. The project should minimize infrastructure while preserving a path to multiple API/worker instances. Redis was previously deferred, and there is no product evidence that a separate queue datastore is required.

At decision time, pg-boss is a PostgreSQL-backed Node.js queue that uses PostgreSQL locking primitives including `SKIP LOCKED`, supports creating jobs inside an existing database transaction, and documents Drizzle adapters. Drizzle supports PostgreSQL through node-postgres and versioned generate/migrate workflows. The AWS SDK for JavaScript v3 provides the standard S3 object API used by S3-compatible services.

## Decision
For the private-beta service default:
- PostgreSQL is the durable relational store for generations, attempts/telemetry, feedback, and service metadata.
- Drizzle ORM with `node-postgres` is the schema/query/migration layer.
- `pg-boss` is the asynchronous generation queue and shares the PostgreSQL deployment rather than adding Redis.
- ZIP artifacts live in a private S3-compatible bucket through AWS SDK v3 semantics.
- Database migrations are versioned and applied with a generate/migrate workflow; production must not depend on schema push at application startup.
- Public API records store object keys/metadata, not provider-specific public URLs. Download authorization/signing belongs to the API/storage adapter.

The service-core ports remain authoritative. These technologies are adapters and must not leak into Planner, Generator, Repair, or Factorio packages.

## Alternatives considered
- Redis + BullMQ — capable, but adds another durable service and operational failure mode before beta evidence justifies it.
- RabbitMQ/NATS/SQS — useful at larger scale or managed-cloud boundaries, but add separate queue operations and/or provider coupling for the initial beta.
- Local filesystem artifact storage — acceptable for M5 only; unsuitable once API and workers can run on different instances.
- Store ZIP bytes in PostgreSQL — rejected because object storage is a better fit for binary artifacts and download delivery.
- Prisma/Kysely instead of Drizzle — viable, but Drizzle keeps schemas/migrations close to TypeScript with a small runtime surface and direct node-postgres support.

## Consequences
### Positive
- One PostgreSQL deployment covers both relational state and the job queue.
- The API can persist generation state and enqueue work transactionally when the adapter is implemented.
- No Redis dependency is required for private beta.
- S3-compatible storage supports local/hosted providers without changing service contracts.
- SQL schema and migrations remain explicit and reviewable.

### Negative / trade-offs
- PostgreSQL becomes a critical dependency for both API state and queue availability.
- pg-boss schema lifecycle must be coordinated with application migrations/backups.
- S3-compatible differences may require adapter configuration such as endpoint/path-style behavior.
- A real PostgreSQL integration environment is required before calling adapters production-ready.

## Implementation note
The first adapter implementation is integration-tested against checksum-pinned PostgreSQL 18.6 built in user space. Drizzle migrations, revision CAS, pg-boss enqueue/fetch, and `fromDrizzle` transactional generation+job submission are exercised against the real server. This dev/test version pin does not require production hosting to use the identical minor patch, but production must use a supported PostgreSQL release and pass the same integration contract.

## Revisit when
Reconsider the queue if measured load, isolation needs, managed-platform constraints, or cross-region requirements make a dedicated queue materially better. Reconsider artifact storage only if beta deployment provides an equivalent shared durable object service.