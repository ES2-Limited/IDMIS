# Area Ownership Map

This table formalizes engineering responsibilities and matches `.github/CODEOWNERS`.

| Area / Path                                                   | Primary Owner       | Description                                                  |
| ------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| `packages/db/**`                                              | `@DEV_A`            | Drizzle schemas, migrations, and database connection clients |
| `packages/contracts/core/**`                                  | `@DEV_A`            | Core domain contracts, DTOs, and identity schemas            |
| `apps/api/src/platform/**`                                    | `@DEV_A`            | API infrastructure, NestJS fastify setup, global telemetry   |
| `apps/api/src/sync/**`                                        | `@DEV_A`            | Server-side offline synchronization ingestion endpoints      |
| `apps/api/src/imports/**`                                     | `@DEV_A`            | Backend tabular dataset import and rollback engines          |
| `apps/worker/**`                                              | `@DEV_A`            | BullMQ background queue processors and jobs                  |
| `apps/api/src/modules/core/**`                                | `@DEV_A`            | Core backend module (auth, schemes, states, users)           |
| `apps/api/src/modules/blis/**`                                | `@DEV_A`            | BLIS backend module (inspections, lab analysis)              |
| `apps/web/src/modules/blis/**`                                | `@DEV_A`            | BLIS frontend module viewports and components                |
| `packages/ui/**`                                              | `@DEV_B`            | Design system primitives, tokens, and reusable components    |
| `packages/sync/**`                                            | `@DEV_B`            | Shared client-server sync protocol and queue data structures |
| `apps/web/src/app/**`                                         | `@DEV_B`            | React root bootstrapping, TanStack router, and query client  |
| `apps/web/src/shell/**`                                       | `@DEV_B`            | Application layout, top bar, navigation, and drawer          |
| `apps/web/src/field/**`                                       | `@DEV_B`            | Mobile field collection forms and 48px touch interfaces      |
| `apps/web/src/offline/**`                                     | `@DEV_B`            | IndexedDB client outbox queue and service worker sync        |
| `apps/web/src/sw/**`                                          | `@DEV_B`            | PWA Service Worker lifecycle and offline cache strategies    |
| `apps/web/src/imports/**`                                     | `@DEV_B`            | Frontend import upload dialogs and preview tables            |
| `apps/web/src/i18n/**`                                        | `@DEV_B`            | Client localization, dictionaries, and language selector     |
| `apps/api/src/modules/slis/**`                                | `@DEV_B`            | SLIS backend module (farmers, WUAs, plots, water)            |
| `apps/web/src/modules/slis/**`                                | `@DEV_B`            | SLIS frontend module viewports, lists, and forms             |
| `apps/api/src/modules/me/**`                                  | `@DEV_B`            | M&E backend module (indicators, targets, reports)            |
| `apps/web/src/modules/me/**`                                  | `@DEV_B`            | M&E frontend dashboards, charts, and reporting tables        |
| `packages/contracts/**`                                       | `@DEV_A` & `@DEV_B` | All domain contracts require joint sign-off                  |
| `.github/**`, `.agents/**`, `AGENTS.md`, `packages/config/**` | `@SAIF`             | Architectural guardrails, CI workflows, and governance       |

---

## Boundary Crossing Rule

If a task requires making changes outside your designated ownership area (for example, `@DEV_A` updating an M&E service or `@DEV_B` modifying database connection logic):

1. **Heads-Up in PR**: You must explicitly check **"Touches another owner's area? Yes"** in `.github/PULL_REQUEST_TEMPLATE.md` and list the affected paths.
2. **Mandatory Approval**: You must request and receive an approving review from the respective area owner before merging.
