# TRIMING IDMIS 2.0 — Agent & Team Guide

## What This Is

TRIMING IDMIS 2.0 is a modular monolith system.

- **Modules**: `core`, `slis`, `me`, `blis` (`proc` planned later).
- **Applications**:
  - `apps/web`: React PWA (Vite, Tailwind CSS v4, TanStack Router, TanStack Query).
  - `apps/api`: NestJS API using Fastify adapter.
  - `apps/worker`: BullMQ background job worker.
- **Packages**: Shared packages under `packages/` (`contracts`, `db`, `ui`, `sync`, `api-client`, `config`).

---

## Golden Rules

1. **Contracts first**: Every feature starts in `packages/contracts` (Zod schema, permission names, import definition). Never define a shape twice.
2. **Module boundaries**: A module may only import another module through `apps/api/src/modules/<module>/public`. No cross-schema SQL, no foreign keys between business schemas.
3. **Scoped repositories**: Every query goes through a repository that applies the user's scope (scheme ids + state ids). Never query tables from controllers or services directly.
4. **Deny by default**: Every route declares a permission using `@Can(...)`. Deny by default.
5. **Atomic writes**: Every write must execute in one transaction containing the business data, an `audit_log` row, and any `outbox_event`.
6. **Optimistic concurrency**: Updates check the `version` column; stale versions return HTTP 409 Conflict.
7. **Identity protection**: Never log or return identity numbers unmasked; they are encrypted at the application layer.
8. **Design system integrity**: UI uses components and tokens from `packages/ui` only; no one-off styled components in `apps/web`.
9. **Zero rogue dependencies**: No new dependency without asking the human first.
10. **Test co-location**: Tests ship with the change: unit tests for schemas and business rules, an API integration test for every endpoint.

---

## Feature Path (Strict Order)

Follow this exact sequence when implementing features:

1. `packages/contracts`: Define Zod schemas, types, permissions, and import schemas.
2. `packages/db`: Update Drizzle schema (`src/schema/<module>.ts`), generate and review migration.
3. `apps/api`: Implement scoped repository, domain service, controller endpoint, and module public export.
4. `apps/web`: Implement TanStack Query hooks, form validation via contract, list, and detail views.
5. Import definition: If dataset is importable, wire import mapping and validation tests.
6. Tests: Unit tests for contracts/services, plus automated API endpoint tests.

---

## Standard Commands

- `pnpm install`: Install workspace dependencies.
- `pnpm dev`: Start all apps concurrently in development mode.
- `pnpm services:up`: Launch PostgreSQL/PostGIS, Redis, and MinIO in Docker.
- `pnpm services:down`: Stop Docker development services.
- `pnpm build`: Build all apps and packages via Turborepo.
- `pnpm lint`: Run ESLint checks with module boundary enforcement.
- `pnpm typecheck`: Run strict TypeScript checks across all workspaces.
- `pnpm test`: Execute automated test suites via Vitest.
- `pnpm db:generate`: Generate Drizzle SQL migrations from schema changes.
- `pnpm db:migrate`: Apply pending database migrations.

---

## Definition of Done

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass locally.
- `.github/PULL_REQUEST_TEMPLATE.md` is completely filled out.
- No `TODO` comments without an associated GitHub issue link.

---

## Stop and Ask the Human Before:

- Modifying authentication, authorization, or permission rules.
- Modifying offline sync protocols or conflict handling.
- Changing data import commit or undo logic.
- Generating or applying migrations on existing populated tables.
- Deleting files or tables.
- Modifying files in an area owned by the other developer (see `docs/ownership.md`).

---

## Pointers & Rules

- Detailed architecture and coding rules live in `.agents/rules/`.
- Architecture Decision Records live in `docs/adr/`.
- Team ownership boundaries live in `docs/ownership.md`.
