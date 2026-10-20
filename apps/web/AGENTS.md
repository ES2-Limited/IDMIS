# Web App Guide (`apps/web`)

## Modular Architecture

- Code is partitioned by domain in `src/modules/<module>` (`core`, `slis`, `me`, `blis`).
- Layout, top bar, and nav belong in `src/shell`. Field forms live in `src/field`.
- File import dialogs live in `src/imports`. Localization resources live in `src/i18n`.

## Routing

- Routes are organized per module in TanStack Router.
- Keep route handlers declarative; delegate page content to module components.

## Data Fetching & State

- All server state interaction MUST use TanStack Query hooks.
- All HTTP calls must use `@idmis/api-client`. Never use raw `fetch` or `axios` in UI components.
- Stale time and invalidation tags must match domain resource boundaries.

## Form Validation

- All forms MUST be validated client-side against the corresponding Zod schema exported from `@idmis/contracts`.
- Never redefine validation shapes or field schemas inside UI components.

## Offline Writes & Sync

- In field mode, offline mutations MUST go through `src/offline` queues (IndexedDB storage).
- Do not make direct optimistic API updates that bypass the offline outbox pipeline.
- All offline operations receive an idempotent client-generated UUID `opId`.

## Design System & UI Components

- Use components, icons, and status chips strictly from `@idmis/ui`.
- Status chips (e.g. pending, approved, rejected, sync_held) MUST use official token definitions.
- Do not create one-off CSS styled components or hardcode hex colors in `apps/web`.
- Every list view must explicitly support Loading, Empty, and Error states.
