# IDMIS 2.0 — Backend Build Plan

ES2 Limited · Oct 20, 2026 · @Saifur-Rahman Yusuf

This is Dev A's plan for building the IDMIS 2.0 backend: database, API, worker and contracts. The frontend developer has a matching plan with the same phases and gates. Work top to bottom; each task says what to build, what it depends on, and how you know it is done. Weeks are estimates counted from kick-off.

## 0. How to use this plan

&#91;embedded content: roadmap · backend and frontend lanes, five phases, five gates\]

### 0.1 What you own

| Area                  | Paths                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| Database              | `packages/db/**` (schema, migrations, seed)                                          |
| Contracts             | `packages/contracts/**`: you write them; the frontend developer reviews every change |
| API                   | `apps/api/**` (platform, sync, imports, all modules)                                 |
| Worker                | `apps/worker/**`                                                                     |
| API client generation | `packages/api-client` build step (the frontend uses its output)                      |

### 0.2 Running a task with Antigravity

Save this plan in the repo as `docs/plan/backend.md` (export as Markdown), so the agent can read it. Then start each task on its own branch with this prompt, changing only the task id:

```text
/new-feature
Implement task BE-1.3 exactly as described in docs/plan/backend.md.
Read the related sections of docs/ (architecture and database schema) first.
Pause for my review after the contract changes and after any migration.
Finish with /pre-pr.
```

Branch names follow the task: `feat/api-auth` for BE-1.3, `feat/db-core-schema` for BE-1.1, and so on.

### 0.3 Working agreement with the frontend developer

Every feature crosses the API, so the two of you meet at the contract first, then build in parallel.

1. **Contract PR first.** You write the Zod schemas, permission names and endpoint list in `packages/contracts` and open a small PR. The frontend developer reviews it within one working day. Nothing else starts until it merges.
2. **Build in parallel.** You implement the endpoints. The frontend builds against mocks generated from the same contracts (MSW), so neither of you waits.
3. **Integrate.** When your endpoints are on `main`, the frontend switches off the mock for that feature and you test the flow together. Bugs found here are fixed on the side that owns them.
4. **Never change a merged contract silently.** A breaking change needs a new contract PR and a heads-up in the team chat.

| Rhythm            | What                                                        |
| ----------------- | ----------------------------------------------------------- |
| Daily             | Short written update in the team chat: done, doing, blocked |
| Twice a week      | 15-minute call on the next contracts                        |
| Friday            | Demo of merged work to Saif on staging                      |
| End of each phase | Gate review: the gate scenario runs end to end on staging   |

### 0.4 Definition of done (every task)

- Lint, typecheck, test and build pass locally and in CI.
- Every new endpoint has a permission, a scoped repository and an API test (Testcontainers).
- Every write records an audit row; events go through the outbox.
- OpenAPI regenerated; the frontend can call the endpoint through `@idmis/api-client`.
- Migrations reviewed by Saif before merge.

### 0.5 Pre-approved libraries

The agent rules say "no new dependency without asking". These are already approved for the backend; anything else needs Saif's OK first.

| Need                   | Library                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| Password hashing       | `argon2`                                                                     |
| Tokens                 | `@nestjs/jwt` (or `jose`)                                                    |
| TOTP                   | `otplib`                                                                     |
| Permissions            | `@casl/ability`                                                              |
| Validation and OpenAPI | `zod`, `@asteasolutions/zod-to-openapi` (or `nestjs-zod`)                    |
| Queues                 | `bullmq`, `ioredis`                                                          |
| Excel                  | `exceljs`                                                                    |
| Files                  | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`                        |
| Shapefiles             | `shapefile` (read), `@turf/area` only if PostGIS cannot do it                |
| PDF                    | `playwright-core` (worker only)                                              |
| Rate limiting          | `@nestjs/throttler`                                                          |
| Testing                | `vitest`, `@testcontainers/postgresql`, `@testcontainers/redis`, `supertest` |
| Logging and errors     | `pino`, `nestjs-pino`, `@sentry/node`                                        |
| Load tests             | `k6` (installed separately, not an npm package)                              |

## 1. Phase 1 — Foundations (weeks 1–3)

**Gate:** a user signs in on the real API from the frontend; an admin creates a user with a scheme or state scope; a WUA spreadsheet imports end to end (template → upload → preview → commit → undo).

#### BE-1.1 Core database schema and seed

- **Week:** 1 · **Depends on:** nothing
- **Build:** the `core` schema from the database doc, section 3: enums, geography (state, lga, ward), organisation + organisation\_state, wua + wua\_officer, app\_user, role, role\_permission, assignment, lookup\_type/value, file, setting. A shared Drizzle helper for the standard columns. Triggers: bump `version` and `updated_at` on update; fill `state_id` from `ward_id`. Seed: 36 states + FCT, roles from the roles table, base lookups, `offline_capture_days = 7`, one System Administrator from env vars.
- **Done when:** `pnpm db:migrate` and seed run on an empty database; a test proves the version trigger and the assignment scope check constraint.

#### BE-1.2 API platform plumbing

- **Week:** 1 · **Depends on:** BE-1.1
- **Build:** config module validating env with Zod; JSON logger with request ids; RFC 9457 problem-details error filter; Zod validation pipe using contract schemas; Idempotency-Key interceptor (stores the first response for 24 hours); transaction helper that writes the audit row; request context (user, abilities, scope); OpenAPI generation from contracts.
- **Done when:** a sample endpoint shows a validation error in problem-details format; a repeated Idempotency-Key returns the stored response; the OpenAPI JSON is served at `/docs/openapi.json`.

#### BE-1.3 Authentication

- **Week:** 1–2 · **Depends on:** BE-1.2
- **Build:** `POST /auth/sign-in`, `/auth/refresh`, `/auth/sign-out`, `GET /auth/me`. Argon2id hashing; 15-minute access JWT; rotating refresh token in an httpOnly cookie, stored hashed per device and revocable; lockout after 5 failures for 15 minutes; TOTP setup and verify, required for System Administrators; admin-triggered password reset.
- **Done when:** API tests cover sign-in, refresh rotation (an old refresh token is rejected), lockout and sign-out; no password or token is logged.
- **Frontend needs this by:** end of week 2.

#### BE-1.4 Permissions and scope

- **Week:** 2 · **Depends on:** BE-1.3
- **Build:** permission catalogue in `packages/contracts/core/permissions.ts`; CASL ability builder from assignments; `@Can('module.resource.action')` guard on every route (deny if missing); scope resolver producing visible scheme ids and state ids; base scoped repository that applies them; `GET /auth/me/abilities` for the frontend.
- **Done when:** tests show a scheme-scoped user cannot read another scheme's rows, a state-scoped user sees rows located in their state across RBDAs, and a route without `@Can` fails a lint or startup check.

#### BE-1.5 Audit log and outbox events

- **Week:** 2 · **Depends on:** BE-1.2
- **Build:** `audit_log` and `outbox_event` tables; audit written inside every service transaction; outbox dispatcher job in the worker with retries and backoff; a subscriber registry so modules declare handlers; app database role with insert-only rights on `audit_log`.
- **Done when:** a test proves a failed transaction leaves no audit or event rows, and a delivered event is marked with `delivered_at`.

#### BE-1.6 Core admin APIs

- **Week:** 2–3 · **Depends on:** BE-1.4, BE-1.5
- **Build:** users and assignments (create, edit, deactivate, assign role × module × scope, offline flag); organisations tree; WUAs and officers; geography read endpoints; lookups CRUD; settings. Cursor pagination and filters on every list.
- **Done when:** each endpoint has an API test including a scope test; contracts are merged and the frontend's mocks match them.

#### BE-1.7 File storage

- **Week:** 3 · **Depends on:** BE-1.2
- **Build:** presigned upload (chunked) and download links for R2, MinIO locally; `core.file` records with checksum; content-type check; virus-scan status field with a stub scanner (real ClamAV in Phase 5).
- **Done when:** a test uploads a file to MinIO, records it, and downloads it through a signed link that expires.

#### BE-1.8 Import engine (first dataset: WUAs)

- **Week:** 3 · **Depends on:** BE-1.6, BE-1.7
- **Build:** `import_batch` and `import_row` tables; import definition format in contracts; template generator (ExcelJS: Data, hidden Lists, Instructions, version stamp); upload endpoint; validate job; preview endpoint with per-cell errors; commit job (upsert on natural key, chunks of 1,000); undo job; progress over server-sent events. Wire the WUA dataset.
- **Done when:** the gate scenario passes in an end-to-end test, an outdated template is refused, and re-uploading the same file creates no duplicates.
- **Frontend needs this by:** start of week 3 (contract), end of week 3 (working).

## 2. Phase 2 — SLIS and sync server (weeks 4–8)

**Gate (field pilot):** at one scheme, collectors register farmers and plots offline on phones; records sync when signal returns; a Scheme Data Officer approves or returns them; a test run of 500 queued records loses none.

#### BE-2.1 SLIS schema and contracts

- **Week:** 4 · **Depends on:** Phase 1
- **Build:** the `slis` schema from the database doc, section 4: season, household, farmer\_group, farmer, farmer\_identity, farm, plot, plot\_allocation, crop\_production, water\_request, fee\_billing, fee\_collection, training, training\_attendance, stream\_flow\_reading. Contracts for each entity. Encryption service (AES-256-GCM) with keyed hash and last-4 for identity numbers; key from env, rotation documented.
- **Done when:** migrations reviewed and applied; contract PR merged after frontend review; a test proves identity numbers are unreadable in the database and still findable by exact number.
- **Frontend needs this by:** end of week 4 (contracts).

#### BE-2.2 Farmers, households and identity documents

- **Week:** 4–5 · **Depends on:** BE-2.1
- **Build:** CRUD for farmers and households; identity documents as a sub-resource (add, list masked, remove); unmasked numbers only with `slis.identity.view`; duplicate check endpoint (name + phone + ward); farmer search with trigram matching.
- **Done when:** API tests cover scope, masking, duplicate detection and version conflicts (409 on stale `If-Match`).

#### BE-2.3 Plots, farms and allocations

- **Week:** 5 · **Depends on:** BE-2.1
- **Build:** plots with point or polygon geometry (GeoJSON in, PostGIS out); area computed server-side in hectares; ward lookup from geometry when not given; farms; allocations by season.
- **Done when:** a test posts a boundary and gets back the correct area within 1%; invalid geometry is rejected with a clear error.

#### BE-2.4 Water requests, fees, trainings, crops, stream flow

- **Week:** 5–6 · **Depends on:** BE-2.1
- **Build:** water requests at four levels with decision; fee billing and collection with unique receipts; trainings with tags and attendance; crop production; stream-flow readings (station id checked against a stub until BLIS exists).
- **Done when:** each resource has API tests including scope; the one-of check (WUA or farmer) is enforced.

#### BE-2.5 Review workflow

- **Week:** 6 · **Depends on:** BE-2.2–2.4
- **Build:** status transitions (draft → submitted → approved / returned) as one shared service; review queue endpoint with filters; bulk approve; return with required comment; events `slis.farmer.approved`, `slis.fee.recorded`, `slis.crop.recorded`.
- **Done when:** a returned record carries its comment back; only approvers in scope can approve; events appear in the outbox.

#### BE-2.6 Sync server

- **Week:** 6–7 · **Depends on:** BE-2.5
- **Build:** device registration and offline grant (from the `offline_capture_days` setting); `change_log` written on every syncable write; `POST /sync/push` with `sync_op` idempotency and the version-conflict rule writing `sync_conflict`; `GET /sync/pull` by cursor, filtered to scope; conflict list and resolve endpoints; reference-data pull for the device's scope.
- **Done when:** tests cover: the same op sent twice is applied once; a stale op becomes a conflict; pull returns only in-scope changes in order; 500 ops in one push complete within 10 seconds locally.
- **Frontend needs this by:** start of week 6 (contract), end of week 7 (working).

#### BE-2.7 SLIS imports

- **Week:** 7 · **Depends on:** BE-1.8, BE-2.2–2.4
- **Build:** import definitions for farmers (with identity documents), plots and allocations, fee billing and collections, water requests, trainings and attendance, crop production.
- **Done when:** each dataset round-trips: template → fill → upload → preview → commit → undo.

#### BE-2.8 SLIS reports and exports

- **Week:** 8 · **Depends on:** BE-2.5
- **Build:** materialised views `mv_farmers_by_scope`, `mv_area_by_service`, `mv_cropping`, `mv_fee_recovery` with refresh jobs; report endpoints for farmers by sector and unit, WUA summaries and fee collection vs billing; XLSX export job for any list.
- **Done when:** report figures match hand-counted test data; an export of 50,000 rows completes in the worker without timing out the API.

## 3. Phase 3 — M&E (weeks 9–11)

**Gate:** one full quarter is entered, computed and approved for at least one scheme and one state, and the indicator matrix matches a hand calculation.

#### BE-3.1 M&E schema, contracts and indicator seed

- **Week:** 9 · **Depends on:** Phase 2; client confirmation of indicator definitions
- **Build:** the `me` schema from the database doc, section 5; contracts; seed the results framework with the 22 indicators from the starting list, including units, baselines, end targets and `compute_key` for the 18 computed ones.
- **Done when:** migrations reviewed; contract PR merged; seed loads; the two definition inconsistencies flagged in the PRD are resolved with the client before seeding.

#### BE-3.2 Targets, values, approval and evidence

- **Week:** 9–10 · **Depends on:** BE-3.1
- **Build:** targets per year and scope; quarterly values per scope and disaggregation; submit and approve flow (State Coordinator or Programme Manager); evidence files on a value; imports for targets and values.
- **Done when:** the unique slot rule holds (one value per indicator, period, scope and disaggregation); approval permissions are tested.

#### BE-3.3 Computed indicators

- **Week:** 10 · **Depends on:** BE-3.2, BE-2.8
- **Build:** SLIS public query services for beneficiaries, gender, area by service type, cropping intensity, yield, fee recovery, WUAs operational, trainings by tag; a nightly compute job plus recompute on SLIS events; values written with `source = computed`; `me.mv_indicator_matrix`.
- **Done when:** each computed indicator has a test with known input rows and the expected value; M&E code imports nothing from `slis` except its `public` folder.

#### BE-3.4 Surveys

- **Week:** 10–11 · **Depends on:** BE-3.1, BE-2.6
- **Build:** survey and question management; responses as syncable records (offline capture); typed answer validation against the question; survey response import.
- **Done when:** a response captured offline syncs and validates; a wrong answer type is rejected per question.

#### BE-3.5 Scorecards, matching grants, technology adoption

- **Week:** 11 · **Depends on:** BE-3.1
- **Build:** CRUD and imports for scorecards (with published file), matching grants and technology adoption records.
- **Done when:** indicators 12, 13 and 16 compute from these records.

## 4. Phase 4 — BLIS (weeks 12–14)

**Gate:** a basin officer imports a year of readings for several stations, records a dam inspection, and sees stations and dams on the map with their latest status.

#### BE-4.1 BLIS schema and contracts

- **Week:** 12 · **Depends on:** Phase 3
- **Build:** the `blis` schema from the database doc, section 6, with `measurement` partitioned by year and a worker job that creates next year's partition each December; contracts.
- **Done when:** migrations reviewed; contract PR merged; a test inserts readings across two years into the right partitions.

#### BE-4.2 Basins, stations, reservoirs and dams

- **Week:** 12 · **Depends on:** BE-4.1
- **Build:** CRUD for basins and morphometry, stations, parameters, reservoirs, dams (owner, consultant, contractor as Core organisations), bio-resources, water-use priorities, stakeholders; imports for stations.
- **Done when:** API tests cover each resource including scope by basin and RBDA.

#### BE-4.3 Time-series readings

- **Week:** 13 · **Depends on:** BE-4.2
- **Build:** measurement import (natural key: station + parameter + time); query endpoint with time range and daily, monthly or yearly aggregation; quality flags; `blis.mv_latest_reading`; event `blis.measurement.loaded`.
- **Done when:** a 100,000-row import commits in the worker; an aggregated query for one station-year returns in under 500 ms locally.

#### BE-4.4 Dam safety inspections

- **Week:** 13 · **Depends on:** BE-4.2
- **Build:** inspections with component condition rows; `meets_standard` rule agreed with the client; `blis.mv_dam_status`; event `blis.dam.inspected` feeding indicator 5.
- **Done when:** an inspection marked as meeting the standard updates indicator 5 after recompute.

#### BE-4.5 Map layers and vector tiles

- **Week:** 14 · **Depends on:** BE-4.2, BE-1.7
- **Build:** shapefile (zipped) and GeoJSON upload converted into `map_layer` + `map_feature`; vector tile endpoint (`ST_AsMVT`) per layer for basins, schemes, sectors, plots, stations and dams, respecting scope.
- **Done when:** the frontend map loads each layer as tiles; a user only receives plots inside their scope.

#### BE-4.6 BLIS public services

- **Week:** 14 · **Depends on:** BE-4.2
- **Build:** station lookup, latest readings and dam status as public services; replace the stream-flow station stub from BE-2.4.
- **Done when:** a SLIS stream-flow reading with an unknown station id is rejected through the public service.

## 5. Phase 5 — Launch readiness (weeks 15–16)

**Gate (go-live):** staging passes load and security tests, a backup restore has been rehearsed, and production is deployed on Railway.

#### BE-5.1 Dashboard endpoints

- **Week:** 15 · **Depends on:** Phases 2–4
- **Build:** aggregate endpoints for programme, state and scheme dashboards (farmers, area, fee recovery, indicator progress, dam status), each with drill-down filters.
- **Done when:** dashboard numbers equal the underlying report views.

#### BE-5.2 PDF reports

- **Week:** 15 · **Depends on:** BE-5.1
- **Build:** worker job rendering HTML report templates to PDF with headless Chromium; scheme report, indicator matrix and dam safety summary.
- **Done when:** each report generates under 30 seconds and is stored in R2 with a signed download link.

#### BE-5.3 Performance

- **Week:** 15–16 · **Depends on:** all features
- **Build:** seed of 1 million farmers and plots on staging; k6 load tests for lists, sync push and pull, and imports; index and query tuning.
- **Done when:** list p95 under 500 ms; sync and import targets from the TRD met.

#### BE-5.4 Security hardening

- **Week:** 16 · **Depends on:** all features
- **Build:** rate limits on auth, sync and import; real ClamAV scanning; TOTP enforcement for admins; dependency audit; external penetration test and fixes; yearly audit-log archive to R2.
- **Done when:** no open critical or high findings.

#### BE-5.5 Operations on Railway

- **Week:** 16 · **Depends on:** BE-5.3
- **Build:** production Railway project (web, api, worker, Postgres with PostGIS, Redis); environment variables; nightly encrypted `pg_dump` to R2; Sentry and uptime alerts; runbooks for deploy, restore and secret rotation.
- **Done when:** a restore from last night's dump into staging is rehearsed and timed.

## 6. Handoffs and tracker

### 6.1 What the frontend is waiting on

These are the dates the frontend plan assumes. If one slips, tell the frontend developer the same day so they can stay on mocks longer.

| Week | You deliver                                    | Frontend uses it for                                |
| ---- | ---------------------------------------------- | --------------------------------------------------- |
| 1    | Auth and core contracts merged                 | Mocks for login and admin screens                   |
| 2    | Sign-in, refresh, `/auth/me/abilities` working | Real login, menus by permission                     |
| 3    | Core admin APIs and import engine working      | Admin screens and import wizard on the real API     |
| 4    | SLIS contracts merged                          | Mocks for field forms and SLIS lists                |
| 6    | Sync contracts merged                          | Offline outbox and sync runner against mocks        |
| 7    | Sync server working on staging                 | Real offline → sync testing on phones               |
| 8    | Review queue and reports working               | Review, conflict and report screens on the real API |
| 9    | M&E contracts merged                           | Quarterly entry and matrix against mocks            |
| 11   | Computed values and surveys working            | Real quarter test for the gate                      |
| 12   | BLIS contracts merged                          | BLIS screens against mocks                          |
| 14   | Vector tiles and readings working              | Map workspace and charts on the real API            |
| 15   | Dashboard endpoints working                    | Role dashboards                                     |

### 6.2 Task tracker

Update the status as you go; link the PR in the last column.

| ID     | Task                               | Week  | Status      | PR  |
| ------ | ---------------------------------- | ----- | ----------- | --- |
| BE-1.1 | Core database schema and seed      | 1     | Not started |     |
| BE-1.2 | API platform plumbing              | 1     | Not started |     |
| BE-1.3 | Authentication                     | 1–2   | Not started |     |
| BE-1.4 | Permissions and scope              | 2     | Not started |     |
| BE-1.5 | Audit log and outbox               | 2     | Not started |     |
| BE-1.6 | Core admin APIs                    | 2–3   | Not started |     |
| BE-1.7 | File storage                       | 3     | Not started |     |
| BE-1.8 | Import engine (WUAs)               | 3     | Not started |     |
| BE-2.1 | SLIS schema and contracts          | 4     | Not started |     |
| BE-2.2 | Farmers, households, identity      | 4–5   | Not started |     |
| BE-2.3 | Plots, farms, allocations          | 5     | Not started |     |
| BE-2.4 | Requests, fees, trainings, crops   | 5–6   | Not started |     |
| BE-2.5 | Review workflow                    | 6     | Not started |     |
| BE-2.6 | Sync server                        | 6–7   | Not started |     |
| BE-2.7 | SLIS imports                       | 7     | Not started |     |
| BE-2.8 | SLIS reports and exports           | 8     | Not started |     |
| BE-3.1 | M&E schema and indicator seed      | 9     | Not started |     |
| BE-3.2 | Targets, values, approval          | 9–10  | Not started |     |
| BE-3.3 | Computed indicators                | 10    | Not started |     |
| BE-3.4 | Surveys                            | 10–11 | Not started |     |
| BE-3.5 | Scorecards, grants, adoption       | 11    | Not started |     |
| BE-4.1 | BLIS schema and contracts          | 12    | Not started |     |
| BE-4.2 | Basins, stations, reservoirs, dams | 12    | Not started |     |
| BE-4.3 | Time-series readings               | 13    | Not started |     |
| BE-4.4 | Dam safety inspections             | 13    | Not started |     |
| BE-4.5 | Map layers and vector tiles        | 14    | Not started |     |
| BE-4.6 | BLIS public services               | 14    | Not started |     |
| BE-5.1 | Dashboard endpoints                | 15    | Not started |     |
| BE-5.2 | PDF reports                        | 15    | Not started |     |
| BE-5.3 | Performance                        | 15–16 | Not started |     |
| BE-5.4 | Security hardening                 | 16    | Not started |     |
| BE-5.5 | Operations on Railway              | 16    | Not started |     |
