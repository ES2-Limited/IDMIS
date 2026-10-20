---
trigger: glob
globs:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - 'tests/**'
---

# Testing Standards & Guardrails

## 1. Testing Pyramid & Responsibilities

- **Unit Tests**:
  - Located alongside code in `*.test.ts`.
  - Required for all Zod contract schemas, business rule functions, utility calculations, and offline sync state reducers.
- **Integration Tests (API)**:
  - Required for every API controller and service.
  - Test the full layer stack (guard → validation → service → repository) with an isolated database container.
  - Verify permission enforcement: test both authorized (200/201) and unauthorized/forbidden (401/403) access paths.
  - Verify optimistic concurrency: test concurrent version updates return 409 Conflict.
- **End-to-End Tests**:
  - Located in `tests/e2e/`.
  - Validate core user workflows using Playwright (e.g. login, farmer creation, offline queue drainage).
- **Load Tests**:
  - Located in `tests/load/`.
  - Validate performance and throughput under peak reporting loads.

## 2. Test Data Guidelines

- **Synthetic Data Only**: All fixtures, factories, and mocks must use synthetic, generated dummy data (e.g. Faker).
- **Zero Real Personal Data**: Never copy real farmer names, phone numbers, addresses, or identification numbers into test fixtures.
- **Deterministic Cleanup**: Integration tests must execute within transactions that roll back or run against ephemeral containers that reset between test runs.

## 3. Co-location & CI Enforcement

- Tests must be committed in the exact same pull request as the implementation feature.
- `pnpm test` must run and pass cleanly without relying on external shared environments.
