# Area Ownership Map

This table formalizes engineering responsibilities and matches `.github/CODEOWNERS`.

| Area / Path                                                                                   | Primary Owner       | Description                                                 |
| --------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `apps/api/**`                                                                                 | `@DEV_A` (backend)  | NestJS API application, platform, modules, and endpoints    |
| `apps/worker/**`                                                                              | `@DEV_A` (backend)  | BullMQ background queue processors, handlers, and jobs      |
| `packages/db/**`                                                                              | `@DEV_A` (backend)  | Drizzle schemas, migrations, and database connection client |
| `packages/api-client/**`                                                                      | `@DEV_A` (backend)  | Generated and typed API client SDK consumed by frontend     |
| `apps/web/**`                                                                                 | `@DEV_B` (frontend) | React PWA application, routes, views, offline, and shell    |
| `packages/ui/**`                                                                              | `@DEV_B` (frontend) | Design system primitives, tokens, and reusable components   |
| `packages/sync/**`                                                                            | `@DEV_B` (frontend) | Client-server offline sync protocols and data structures    |
| `tests/e2e/**`                                                                                | `@DEV_B` (frontend) | End-to-end user journey and automated browser test suites   |
| `packages/contracts/**`                                                                       | `@DEV_A` & `@DEV_B` | Shared domain contracts; both developers must approve       |
| `.github/**`, `.agents/**`, `AGENTS.md`, `**/AGENTS.md`, `packages/config/**`, `docs/plan/**` | `@SAIF` (lead)      | Architectural guardrails, CI workflows, and build plans     |

---

## Boundary Crossing Rule

If a task requires making changes outside your designated ownership area (for example, `@DEV_A` modifying UI tokens or `@DEV_B` updating database migrations):

1. **Heads-Up in PR**: You must explicitly check **"Touches another owner's area? Yes"** in `.github/PULL_REQUEST_TEMPLATE.md` and list the affected paths.
2. **Mandatory Approval**: You must request and receive an approving review from the respective area owner before merging.
