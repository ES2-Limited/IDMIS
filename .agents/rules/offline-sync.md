---
trigger: glob
globs:
  - 'apps/web/src/offline/**'
  - 'packages/sync/**'
  - 'apps/api/src/sync/**'
---

# Offline-First & Sync Guidelines

## 1. Architecture

IDMIS 2.0 operates offline-first for field personnel. Offline mutations are enqueued locally in IndexedDB (`apps/web/src/offline`), processed using synchronized queue protocols (`packages/sync`), and ingested safely by the backend (`apps/api/src/sync`).

## 2. Outbox Operation Shape

Every offline operation queued in the client must adhere to the standard operation envelope:

```typescript
interface OutboxOperation {
  opId: string; // Client-generated UUIDv4/v7 for idempotency
  entityName: string; // e.g. "farmer", "inspection"
  action: 'create' | 'update' | 'delete';
  entityId: string; // Target resource UUID
  baseVersion: number; // Entity version on device when mutation began
  payload: unknown; // Validated contract mutation payload
  createdAt: string; // ISO 8601 device timestamp
  status: 'pending' | 'syncing' | 'failed' | 'held';
  attempts: number;
  lastError?: string;
}
```

## 3. Idempotency & Conflict Rules

- **Idempotent Ingestion**: `opId` is recorded in the backend upon receipt. Duplicate attempts return the cached outcome without re-execution.
- **baseVersion Conflict Rule**:
  - When an update operation arrives at the server, `baseVersion` is compared to the database `version`.
  - If `db.version === baseVersion`, the write succeeds, increments `version`, and returns the updated entity.
  - If `db.version > baseVersion`, the server flags a conflict. The operation status is set to `held` in the client.
- **No silent overwrites**: The server never silently overwrites concurrent server-side modifications.
- **Human-in-the-loop resolution**: Held conflicts surface in the UI sync resolution center for field worker or supervisor manual review.

## 4. Preservation Guarantee

- Never delete queued outbox records until the server returns an explicit 2xx acknowledgement.
- Failed operations must be preserved in IndexedDB with error details for diagnostic review.
