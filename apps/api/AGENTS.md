# API App Guide (`apps/api`)

## Layer Order & Responsibilities

Every request flows through strict architectural layers:
`Guard` → `Validation (Zod)` → `Controller` → `Service` → `Repository`

- **Guards**: Authenticate JWT and authorize permissions via `@Can(permission)`.
- **Validation**: Validate request bodies/params using contracts from `@idmis/contracts`. No global ValidationPipe.
- **Controllers**: Thin HTTP adapters in `src/modules/<module>/controllers`. Only orchestrate DTOs and call domain services.
- **Services**: Business logic in `src/modules/<module>/services`. Manage single atomic write transactions (entity + audit + outbox).
- **Repositories**: Data access in `src/modules/<module>/repositories`. MUST inject user scope (`schemeIds`, `stateIds`) into every select/update/delete. Never query database directly from services or controllers.

## Public Exports & Cross-Module Communication

- Public contracts and inter-module services go into `src/modules/<module>/public`.
- Cross-module access is ONLY permitted via `public/`. ESLint boundary rules enforce this.
- Asynchronous events and listeners belong in `src/modules/<module>/subscribers`.

## Security & Permissions

- Every endpoint must declare its required permission using `@Can('module.resource.action')`. Deny by default.

## Headers & Concurrency Controls

- **Optimistic Concurrency**: Mutation endpoints on versioned resources require `If-Match: "<version>"`. A mismatch yields `409 Conflict`.
- **Idempotency**: All non-idempotent POST/PATCH state modifications require an `Idempotency-Key` header, stored and checked in Redis/Postgres before processing.

## Error Format (RFC 9457)

All errors return Problem Details JSON (`application/problem+json`):

```json
{
  "type": "https://idmis.triming.org/errors/conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Version mismatch. Current version is 4.",
  "instance": "/api/v1/farmers/123"
}
```
