---
description: Create a new API endpoint across repository, service, controller, and automated integration test.
---

# Add Endpoint Workflow

1. **Check Contract**:
   - Ensure the request/response DTO and route permissions exist in `packages/contracts`. If missing, add them first.

2. **Repository Method**:
   - In `apps/api/src/modules/<module>/repositories/<entity>.repository.ts`, add the query or mutation.
   - Enforce tenant scope: filter strictly by `schemeIds` and `stateIds`.

3. **Service Method**:
   - In `apps/api/src/modules/<module>/services/<entity>.service.ts`, implement the use case.
   - For mutations, wrap operations in a single database transaction:
     - Entity write
     - Audit log write
     - Outbox event write (if applicable)
   - Enforce optimistic concurrency by checking the `version` column.

4. **Controller Route**:
   - In `apps/api/src/modules/<module>/controllers/<entity>.controller.ts`, add the HTTP handler method (`@Get`, `@Post`, `@Patch`, `@Delete`).
   - Decorate with `@Can('module.resource.action')`.
   - Validate incoming payloads against the contract schema.
   - Handle RFC 9457 error responses on failure.

5. **API Integration Test**:
   - Create or update the test suite under `apps/api/src/modules/<module>/__tests__/<entity>.controller.spec.ts`.
   - Test successful path with authorized permissions (200/201).
   - Test permission denial when lacking the permission token (403).
   - Test optimistic locking conflict response (409).
   - Run `pnpm --filter @idmis/api test`.
