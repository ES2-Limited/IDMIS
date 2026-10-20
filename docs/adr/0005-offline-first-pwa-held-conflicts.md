# ADR 0005: Offline-First PWA with Held Conflicts Resolution

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

Field officers operating in remote irrigation scheme locations frequently encounter poor or nonexistent cellular connectivity while registering farmers, recording canal inspections, and logging M&E surveys. Data capture must remain functional offline without risk of data loss or silent overwrite.

## Decision Drivers

- High field reliability on low-cost mobile devices.
- Zero data loss for mobile data capture sessions.
- Clear, predictable conflict resolution when multiple officers edit related records concurrently.

## Decision Outcome

Adopted an **Offline-First Progressive Web App (PWA)** architecture:

- Client-side outbox queue backed by IndexedDB (`apps/web/src/offline`).
- Every offline mutation generates an idempotent `opId` UUID and captures the resource's `baseVersion`.
- On reconnection, the client drains the queue against `apps/api/src/sync`.
- **Held Conflicts Rule**:
  - If the database `version` equals `baseVersion`, the update is committed and `version` increments.
  - If `db.version > baseVersion`, the server flags a conflict. The record enters `held` status in the client.
  - The system never silently overwrites data; held records require human-assisted review via the sync center.

### Positive Consequences

- Seamless field operation regardless of connectivity state.
- Complete audit trail of attempted offline operations.
- Explicit conflict transparency prevents accidental data corruption.

### Negative Consequences / Trade-offs

- Requires dedicated UI workflows in the web app for reviewing and resolving held conflict states.
