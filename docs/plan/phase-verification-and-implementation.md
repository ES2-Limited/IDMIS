# TRIMING IDMIS 2.0 — End-to-End Phase Verification & Implementation Plan

ES2 Limited · November 2026 · Antigravity & Engineering Team

This document outlines the systematic, phase-by-phase verification, live staging integration, and progressive implementation roadmap for IDMIS 2.0. Each phase pairs backend endpoints and contracts with frontend screens and offline storage, executing automated tests, live staging API validation, and acceptance gates before advancing.

---

## 0. Development Standard Operating Procedures (SOP)

### 0.1 Frontend-to-Server Connection Protocol

Every client-server interaction MUST strictly adhere to the following architecture:

1. **Gateway via `@idmis/api-client` Only**:
   - Direct `fetch()` calls in components or screens are forbidden (Golden Rule #3 / Definition of Done).
   - All HTTP requests go through `getApiClient()` or TanStack Query hooks wrapping `@idmis/api-client`.
2. **Endpoint Routing & Base URL**:
   - The default base URL is `/api` (relative path).
   - In production/staging on Railway, web assets and the Fastify NestJS API are hosted under the same domain (`https://web-staging-f6aa.up.railway.app/api/...`), completely avoiding CORS preflight latency and third-party cookie restrictions.
   - In local development, the Vite dev server or Docker proxy routes `/api` directly to `http://localhost:3000`.
3. **Session Lifecycle & Transparent Refresh**:
   - Short-lived Access Token (15 mins) kept in-memory and synced to `sessionStorage` across page reloads.
   - Long-lived Rotating Refresh Token stored in an `httpOnly`, Secure cookie (`credentials: 'include'`).
   - On HTTP `401 Unauthorized`, `ApiClient.request()` intercepts the failure, transparently triggers `POST /api/auth/refresh`, updates the token, and retries the request once before propagating errors.
   - Expired refresh tokens trigger `onUnauthorized()`, clearing user context and returning to `/sign-in`.
4. **Offline-First Synchronization (ADR 0005)**:
   - Field operations store records in Dexie IndexedDB (`@idmis/sync`).
   - Reconnection queues batch mutations to `POST /api/slis/sync/push` with `{ opId, entity, action, recordId, baseVersion, payload }`.
   - Matching versions commit atomically with `audit_log` rows; version mismatches yield Held Conflicts routed to the Review Queue.
5. **MSW Mock Switching**:
   - Develop against MSW mock handlers generated from `packages/contracts`.
   - Toggle mocks off per-feature as staging endpoints are verified live.

---

### 0.2 Commit Hygiene & Author Identity Rules

To prevent CI rejection and comply with team governance:

1. **Commit Author Identity**:
   - Commits MUST strictly use the developer's registered human git author:
     ```bash
     git commit --author="Shittu Ibrahim <2bitspanky2000@gmail.com>" -m "..."
     ```
   - **Never run `git config`** to alter global repository author settings.
   - **Zero AI Attribution**: Never include `Co-authored-by:`, `Generated-with:`, or any agent signatures in commit messages or pull request bodies.
2. **Conventional Commit Formats & Allowed Scopes**:
   - Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
   - Allowed scopes (enforced strictly by `.github/workflows/pr-title.yml`):
     `core`, `slis`, `me`, `blis`, `web`, `api`, `worker`, `db`, `contracts`, `ui`, `sync`, `infra`, `deps`, `deps-dev`
   - PR titles and commits must use an allowed scope, e.g.:
     - `feat(web): ...`
     - `fix(ui): ...`
     - `docs(core): ...`
     - `test(contracts): ...`

---

### 0.3 Pull Request & Branch Management Workflow

1. **Branch Naming**:
   - Follow task ids: `feat/web-auth`, `feat/slis-farmer-wizard`, `feat/phase-1-verification`.
   - **NEVER delete branches**, even after merging or completing tasks.
2. **Pre-PR Quality Checks (Mandatory)**:
   - `pnpm lint` (0 errors)
   - `pnpm typecheck` (strict TypeScript validation)
   - `pnpm test` (all Vitest suites pass)
   - `pnpm build` (clean Vite / tsup builds)
3. **PR Creation & Tracking**:
   - Use `gh pr create` with full description and markdown summary.
   - Track GitHub Actions CI workflow until all checks (PR Title, Secret Scanning, Commit Hygiene, Lint/Test/Build) turn **Green**.
   - **Stop and ask human review before merging into `main`**.

---

### 0.4 Command Timers & Background Polling Rules

- **No Manual Polling Loops**: Antigravity is reactive. Never run polling loops (e.g., looping `Start-Sleep` or shell scripts) to check background tasks or CI status.
- **Background Tasks**: Long-running commands (dev servers, large test suites, CI checks) run via asynchronous task runner tools and wake up on completion events automatically.

---

## 1. Staging Endpoints Reference

- **Frontend App**: `https://web-staging-f6aa.up.railway.app`
- **API Base**: `https://web-staging-f6aa.up.railway.app/api`
- **Swagger Documentation**: `https://web-staging-f6aa.up.railway.app/api/docs`
- **OpenAPI Schema**: `https://web-staging-f6aa.up.railway.app/api/docs/openapi.json`
- **Health Check**: `https://web-staging-f6aa.up.railway.app/api/health`

---

## 2. Three-Tier Verification Architecture

```
┌────────────────────────────────────────────────────────┐
│  Tier 1: Unit & Contract Tests                         │
│  • Zod schema validation (packages/contracts)          │
│  • Domain service & utility tests                      │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: Component, Hook & Mock Tests                  │
│  • Vitest + Testing Library + MSW                      │
│  • Offline Dexie store & sync queue simulation         │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tier 3: Live Staging Integration & E2E Validation     │
│  • Real API handshake (https://web-staging-f6aa...)    │
│  • Live Swagger contract verification                  │
│  • End-to-end persona journeys (National to Field)     │
└────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Platform, Identity & Scope Hierarchy

### 1.1 Scope & Key Components

- **Contracts & DB**: `core` schema (users, roles, permissions, geography, assignments, WUAs, settings).
- **Backend APIs**:
  - `POST /api/auth/sign-in`, `POST /api/auth/totp/verify`, `POST /api/auth/refresh`, `POST /api/auth/sign-out`
  - `GET /api/auth/me`, `GET /api/auth/me/abilities`
  - `GET /api/users`, `POST /api/users`, `GET /api/users/:id`, `PATCH /api/users/:id`
  - `GET /api/organisations`, `GET /api/wuas`, `GET /api/geography/states`
- **Frontend Views**:
  - `SignInView.tsx` (Credentials + TOTP MFA step)
  - `ScopePicker.tsx` (National, State, RBDA, Scheme, Sector)
  - `UserManagementView.tsx` & `OrganisationsTreeView.tsx`
  - `ImportCenterView.tsx` & `ImportWizard.tsx` (WUA bulk batch import)

### 1.2 Verification & Test Procedures

1. **Contract & Schema Check**:
   - Verify `packages/contracts/src/auth.ts` and `packages/contracts/src/users.ts`.
   - Run: `pnpm --filter @idmis/contracts test`
2. **Local Component & Auth Tests**:
   - Run: `pnpm --filter @idmis/web test -- src/auth/auth.test.ts`
3. **Live Staging API Verification**:
   - Verify `POST /api/auth/sign-in` with valid seed credentials.
   - Verify session retention and abilities extraction (`GET /api/auth/me/abilities`).
   - Test user assignment editor with scope constraints (e.g. State Coordinator restricted to Kano State).
4. **Phase 1 Acceptance Gate**:
   - Sign in as System Admin; create a State-scoped user; download WUA import template, upload valid spreadsheet, preview, commit, and test batch undo.

---

## Phase 2: SLIS, Offline Data Layer & Mobile Field PWA

### 2.1 Scope & Key Components

- **Contracts & DB**: `slis` schema (farmers, plots, seasonal crop production, water requests, fee collections).
- **Offline Storage (`@idmis/sync`)**:
  - IndexedDB Dexie tables (`farmers`, `plots`, `outbox`, `conflicts`).
  - Top bar / bottom bar sync indicators and `SyncDrawer.tsx`.
- **Backend APIs**:
  - `GET /api/slis/farmers`, `POST /api/slis/farmers`, `GET /api/slis/farmers/:id`
  - `GET /api/slis/plots`, `POST /api/slis/plots`, `GET /api/slis/plots/:id`
  - `POST /api/slis/sync/push`, `GET /api/slis/sync/pull`
  - `GET /api/slis/review`, `POST /api/slis/review/:id/approve`, `POST /api/slis/review/:id/reject`
- **Frontend Views**:
  - Field Layout: `FieldHomeView.tsx`, `FieldCaptureView.tsx`, `FarmerRegistrationWizard.tsx`, `PlotMappingView.tsx`.
  - Desktop Operations: `FarmersListView.tsx`, `PlotsMapView.tsx`, `ReviewConflictsListView.tsx`, `SlisReportsView.tsx`.

### 2.2 Verification & Test Procedures

1. **Field Form & Calculation Tests**:
   - Run: `pnpm --filter @idmis/web test -- src/modules/slis/field/farmer-registration.test.ts`
   - Run: `pnpm --filter @idmis/web test -- src/modules/slis/field/spatial-utils.test.ts`
2. **Offline Outbox & Mutation Queuing**:
   - Verify Dexie outbox records are created when offline.
   - Verify `SyncDrawer` accurately displays queued operations and triggers manual sync.
3. **Live Staging Farmer & Plot Creation**:
   - Push a test farmer registration and polygon plot boundary to staging API.
   - Verify spatial polygon coordinates and boundary calculation via PostGIS.
4. **Phase 2 Acceptance Gate (Field Pilot)**:
   - Field enumerator creates 3 farmers and 3 plots in airplane mode.
   - Connection restores, records synchronize to staging without data loss, and Scheme Manager approves the records.

---

## Phase 3: M&E, Results Framework & Project Indicators

### 3.1 Scope & Key Components

- **Contracts & DB**: `me` schema (results framework, indicators, quarterly entries, surveys, scorecards, matching grants, technology adoptions).
- **Backend APIs**:
  - `GET /api/me/indicators`, `POST /api/me/indicators`, `GET /api/me/indicators/:id`
  - `GET /api/me/values/matrix`, `POST /api/me/values/quarterly`
  - `GET /api/me/surveys`, `POST /api/me/surveys`, `POST /api/me/surveys/submit`
  - `GET /api/me/scorecards`, `GET /api/me/matching-grants`, `GET /api/me/technology-adoption`
- **Frontend Views**:
  - `IndicatorsListView.tsx` & `IndicatorMatrixView.tsx`
  - `QuarterlyDataEntryView.tsx`
  - `SurveysManagementView.tsx` & `FieldSurveyCaptureForm.tsx`
  - `ScorecardsListView.tsx` & `MatchingGrantsListView.tsx`

### 3.2 Verification & Test Procedures

1. **Quarterly Formula & Validation Tests**:
   - Test target vs. actual variance calculations, auto-aggregation rules, and disaggregation (male, female, youth).
2. **Survey Form Dynamic Engine**:
   - Validate field rendering of Likert scales, multi-select questions, and skip logic.
3. **Live Staging M&E Handshake**:
   - Fetch indicator matrix from `/api/me/values/matrix`.
   - Submit quarterly milestone actuals and verify auto-calculated percentage progress.
4. **Phase 3 Acceptance Gate**:
   - M&E Officer submits Q3 data for Kano River Irrigation Scheme; values reflect in the indicator matrix and disaggregation tallies match.

---

## Phase 4: BLIS Hydrology, Asset Ledger & GIS Visualizer

### 4.1 Scope & Key Components

- **Contracts & DB**: `blis` schema (river basins, hydrometric stations, reservoirs, dam safety inspections, telemetry readings, spatial GIS layers).
- **Backend APIs**:
  - `GET /api/blis/basins`, `GET /api/blis/stations`, `GET /api/blis/dams`
  - `POST /api/blis/dam-inspections`, `GET /api/blis/dam-inspections/:id`
  - `GET /api/blis/readings`, `POST /api/blis/readings/timeseries`
  - `GET /api/blis/layers`, `POST /api/blis/layers/upload`
- **Frontend Views**:
  - `BlisMapWorkspaceView.tsx` (MapLibre vector tiles, layer switcher, offline map caching).
  - `StationsListView.tsx`, `DamsListView.tsx`, `BasinsListView.tsx`.
  - `DamInspectionsListView.tsx` & `FieldDamInspectionCaptureForm.tsx`.
  - Hydrograph Time-Series Charts (Water levels, reservoir storage capacity, rainfall ledger).

### 4.2 Verification & Test Procedures

1. **Map & GIS Layer Tests**:
   - Test MapLibre GL layer toggle, coordinate bounds transformation, and offline tile fallback.
2. **Hydrograph Chart Component Tests**:
   - Test ECharts hydrograph rendering with missing values, extreme precipitation peaks, and multi-year comparisons.
3. **Dam Safety Severity Validation**:
   - Validate risk category scoring (Critical, High, Moderate, Low) based on seepage and structural cracking inputs.
4. **Phase 4 Acceptance Gate**:
   - Hydrologist records reservoir stage reading; line chart updates; Dam Inspector records field inspection with geotagged photos and syncs to staging.

---

## Phase 5: Dashboards, PDF Reporting, Hardening & Final Gate

### 5.1 Scope & Key Components

- **Backend APIs**:
  - `GET /api/dashboards/programme`, `GET /api/dashboards/state/:stateId`, `GET /api/dashboards/scheme/:schemeId`
  - `POST /api/reports`, `GET /api/reports/:id`, `GET /api/reports/:id/download`
  - `GET /api/health` (Deep health check)
- **Frontend Views & Polish**:
  - Multi-tier Role Dashboards (`CoreHome.tsx`, `SlisHome.tsx`, `MeHome.tsx`).
  - Top-centered accessible Toast notification system.
  - Multi-language switcher (English, Hausa, Yoruba, Igbo).
  - PDF Generation & Export preview dialogs.

### 5.2 Verification & Test Procedures

1. **Full Role Journey E2E Suite**:
   - Run: `pnpm --filter @idmis/web test -- src/app/e2e-role-journeys.test.ts`
   - Covers: National Admin, State Coordinator, Scheme Manager, Field Enumerator, M&E Officer, BLIS Hydrologist.
2. **Accessibility & Responsive Checks**:
   - Run: `pnpm --filter @idmis/web test -- src/app/states-accessibility.test.ts`
   - Verify mobile viewport (360px), tablet (768px), and desktop (1280px).
3. **Deep Health Check Live Staging Verification**:
   - Query `/api/health` ensuring all 5 subsystems report `'up'`.
4. **Phase 5 Acceptance Gate (Full System Sign-Off)**:
   - Run clean production build: `pnpm build`
   - Run full test suite across monorepo: `pnpm test`
   - Zero lint errors (`pnpm lint`) and strict TypeScript typechecking pass (`pnpm typecheck`).

---

## Phase Execution Checklist

| Phase       | Description                                       |    Status    | Unit Tests | Staging Live | Gate Pass |
| :---------- | :------------------------------------------------ | :----------: | :--------: | :----------: | :-------: |
| **Phase 1** | Core Platform, Identity & Scope Hierarchy         | **Verified** |    [x]     |     [x]      |    [x]    |
| **Phase 2** | SLIS, Offline Data Layer & Mobile Field PWA       |   Pending    |    [ ]     |     [ ]      |    [ ]    |
| **Phase 3** | M&E, Results Framework & Project Indicators       |   Pending    |    [ ]     |     [ ]      |    [ ]    |
| **Phase 4** | BLIS Hydrology, Asset Ledger & GIS Visualizer     |   Pending    |    [ ]     |     [ ]      |    [ ]    |
| **Phase 5** | Dashboards, PDF Reporting, Hardening & Final Gate |   Pending    |    [ ]     |     [ ]      |    [ ]    |
