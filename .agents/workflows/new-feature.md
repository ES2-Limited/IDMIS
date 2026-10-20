---
description: Walk the IDMIS 2.0 feature implementation path step-by-step with checkpoints for human review.
---

# New Feature Workflow

Follow this step-by-step process to implement a new feature in IDMIS 2.0:

1. **Step 1: Define Contracts**
   - Open `packages/contracts/src/<module>/<entity>.ts`.
   - Define entity Zod schemas, DTOs, and export inferred TypeScript types.
   - Add new permissions to `packages/contracts/src/permissions.ts` using `module.resource.action` notation.
   - Run `pnpm typecheck` in contracts.
   - **STOP & CHECKPOINT**: Ask the human engineer to review the contracts before proceeding to database work.

2. **Step 2: Database Schema & Migration**
   - Update table definitions in `packages/db/src/schema/<module>.ts`.
   - Ensure standard columns are present: `id` (UUIDv7), `version`, `createdAt/By`, `updatedAt/By`, `deletedAt`.
   - Add spatial indexes (if PostGIS geometry) and scope indexes (`scheme_id`, `state_id`).
   - Run `pnpm db:generate` to produce the SQL migration file.
   - **STOP & CHECKPOINT**: Present the generated SQL migration to the human engineer for review before running `pnpm db:migrate`.

3. **Step 3: Backend Implementation (apps/api)**
   - Add scoped query and mutation methods to `src/modules/<module>/repositories`.
   - Implement business logic, optimistic concurrency checks, and transactional audit/outbox entries in `src/modules/<module>/services`.
   - Expose the HTTP endpoint in `src/modules/<module>/controllers` decorated with `@Can(...)`.
   - If other modules need to access this capability, export an interface and service in `src/modules/<module>/public`.

4. **Step 4: Frontend Implementation (apps/web)**
   - Add TanStack Query hooks using `@idmis/api-client`.
   - Build form inputs validated with the contract Zod schema.
   - Use components and status chips exclusively from `@idmis/ui`.
   - Implement loading, empty, and error states for all viewports.

5. **Step 5: Testing & Verification**
   - Write unit tests for business logic and schemas.
   - Write API integration tests covering authorized and forbidden permission paths.
   - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
