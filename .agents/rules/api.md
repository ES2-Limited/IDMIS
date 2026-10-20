---
trigger: glob
globs:
  - 'apps/api/**'
---

# NestJS API Guidelines (`apps/api`)

## 1. Module Structure

- All domain code is organized under `src/modules/<module>/` where `<module>` is one of `core`, `slis`, `me`, `blis`.
- Module subfolders:
  - `public/`: Public interfaces, DTOs, and cross-module entry services.
  - `controllers/`: Thin HTTP adapters decorated with `@Controller` and `@Can(...)`.
  - `services/`: Core use-cases, business logic, and transaction boundaries.
  - `repositories/`: Scoped database access classes.
  - `subscribers/`: Internal event listeners.
  - `imports/`: Dataset validation, parsing, and batch ingestion.
- Cross-cutting concerns reside in `src/platform/` (logger, telemetry, filters, guards) and `src/sync/` (sync ingestion handlers).

## 2. Dependency Injection & Boundaries

- Modules must only inject and consume services exported from another module's `public/` folder.
- ESLint boundary rules enforce this: importing from internal folders (services, repositories, controllers) of another module fails the build.

## 3. Scoped Repositories

- Repositories MUST enforce user multi-tenancy scoping on every query:
  - Filtering by allowed `schemeIds` and `stateIds` derived from the active request context.
  - Never allow raw un-scoped `select().from(...)` queries without tenant predicates.
  - Direct database access from controllers or services is prohibited.

## 4. Transactions & Outbox Pattern

- Every mutating write operation (create, update, delete) must be wrapped in a single database transaction containing:
  1. The business entity state change.
  2. An `audit_logs` record capturing `userId`, `action`, `entityName`, `entityId`, `before`, and `after`.
  3. An `outbox_events` record when downstream async processing or message publishing is required.
- The background worker (`apps/worker`) polls and drains the `outbox_events` table via BullMQ.

## 5. Permissions & Security

- Decorate routes with `@Can('module.resource.action')`.
- Global guards reject unauthenticated or unpermitted requests by default (401/403).
- Do not use NestJS global `ValidationPipe`. Request inputs are parsed and validated using Zod contracts from `@idmis/contracts`.

## 6. Concurrency & Idempotency

- Updates must check `If-Match: "<version>"` or match the entity's current `version` integer. If the record was modified concurrently, return `409 Conflict`.
- State-changing POST/PATCH requests must accept an `Idempotency-Key` header and ensure operations are executed at most once.

## 7. Testing with Testcontainers

- End-to-end and integration tests run against isolated ephemeral containers using Testcontainers (PostgreSQL/PostGIS, Redis).
- Test fixtures must use synthetic, generated data; never seed or mock real personal identifiable information.
