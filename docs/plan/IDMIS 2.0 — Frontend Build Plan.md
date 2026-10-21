# IDMIS 2.0 — Frontend Build Plan

ES2 Limited · Oct 20, 2026 · @Saifur-Rahman Yusuf

This is Dev B's plan for building the IDMIS 2.0 frontend: the design system, the desktop workspace and the offline field app. The backend developer has a matching plan with the same phases and gates. Work top to bottom; each task says what to build, what it depends on, and how you know it is done. Weeks are estimates counted from kick-off.

## 0. How to use this plan

&#91;embedded content: roadmap · backend and frontend lanes, five phases, five gates\]

### 0.1 What you own

| Area             | Paths                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web app          | `apps/web/**` (shell, field app, modules, offline, service worker, i18n)                                            |
| Design system    | `packages/ui/**` (tokens, components, patterns, charts, maps)                                                       |
| Offline client   | `packages/sync/**`                                                                                                  |
| Contracts        | `packages/contracts/**`: the backend developer writes them; you review every change from the screen's point of view |
| End-to-end tests | `tests/e2e/**`                                                                                                      |

### 0.2 Running a task with Antigravity

Save this plan in the repo as `docs/plan/frontend.md` (export as Markdown), so the agent can read it. Then start each task on its own branch with this prompt, changing only the task id:

```text
/new-feature
Implement task FE-1.2 exactly as described in docs/plan/frontend.md.
Read the related sections of docs/ (architecture and design flows) first.
Use only components and patterns from packages/ui; add missing ones there first.
Finish with /pre-pr.
```

Branch names follow the task: `feat/ui-tokens` for FE-1.1, `feat/web-shell` for FE-1.2, and so on.

### 0.3 Working agreement with the backend developer

1. **Review contracts within one working day.** The backend opens a contract PR (Zod schemas, permissions, endpoint list) before each feature. Check it from the screen's point of view: does every field the form or list needs exist, with the right name and validation?
2. **Build against mocks.** Generate MSW handlers from the merged contracts and build the screens straight away. Mock data lives in `apps/web/src/mocks/` and must look realistic (Nigerian names, real states and LGAs, sensible figures).
3. **Switch to the real API.** When the backend marks an endpoint done on `main`, turn off its mock (one flag per feature) and test together.
4. **Never invent API fields.** If a screen needs something the contract lacks, ask for a contract change; never fake it in the frontend.

| Rhythm            | What                                                        |
| ----------------- | ----------------------------------------------------------- |
| Daily             | Short written update in the team chat: done, doing, blocked |
| Twice a week      | 15-minute call on the next contracts                        |
| Friday            | Demo of merged work to Saif on staging                      |
| End of each phase | Gate review: the gate scenario runs end to end on staging   |

### 0.4 Definition of done (every task)

- Lint, typecheck, test and build pass locally and in CI.
- Every screen has loading, empty and error states, and works at 360 px wide.
- No hard-coded colours or spacing; tokens only.
- Keyboard reachable, labelled inputs, visible focus; axe shows no serious issues.
- Data comes through TanStack Query hooks on `@idmis/api-client`; no raw `fetch`.
- Screenshots in the PR for every changed screen (desktop and phone).

### 0.5 Pre-approved libraries

Anything not listed needs Saif's OK first.

| Need                  | Library                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Accessible primitives | `@radix-ui/*` (shadcn/ui pattern, copied into `packages/ui`)                                     |
| Styling helpers       | `class-variance-authority`, `tailwind-merge`, `clsx`                                             |
| Icons                 | `lucide-react`                                                                                   |
| Forms                 | `react-hook-form`, `@hookform/resolvers` (Zod)                                                   |
| Tables                | `@tanstack/react-table`, `@tanstack/react-virtual`                                               |
| Routing and data      | `@tanstack/react-router`, `@tanstack/react-query`                                                |
| Offline storage       | `dexie`, `dexie-react-hooks`                                                                     |
| PWA                   | `vite-plugin-pwa` (Workbox inside)                                                               |
| Image compression     | `browser-image-compression`                                                                      |
| Maps                  | `maplibre-gl`, `@turf/area`, `@turf/helpers`                                                     |
| Charts                | `echarts`, `echarts-for-react`                                                                   |
| Dates                 | `date-fns`                                                                                       |
| i18n                  | `i18next`, `react-i18next`                                                                       |
| Mocks                 | `msw`                                                                                            |
| Component workshop    | `storybook` (React + Vite)                                                                       |
| Testing               | `vitest`, `@testing-library/react`, `@playwright/test`, `@axe-core/playwright`, `fake-indexeddb` |
| Errors                | `@sentry/react`                                                                                  |

## 1. Phase 1 — Foundations (weeks 1–3)

**Gate:** a user signs in on the real API; menus show only what their role allows; an admin creates a user with a scheme or state scope; a WUA spreadsheet imports end to end through the wizard.

#### FE-1.1 Design tokens and base components

- **Week:** 1 · **Depends on:** nothing
- **Build:** tokens in `packages/ui/tokens` wired into Tailwind v4: water-and-soil palette (deep teal primary, warm ochre accent, neutral greys), status colours (good, warning, critical), type scale (Inter or IBM Plex Sans), 8-point spacing, radii, shadows. Base components: Button, IconButton, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, DatePicker, Dialog, Sheet, Toast, Tabs, Tooltip, Badge, StatusChip (Draft, Saved on device, Syncing, Needs fixing, Awaiting review, Conflict, Returned, Approved), Card, EmptyState, Skeleton, Spinner. Storybook with a story per component.
- **Done when:** every component has a story, passes axe in Storybook, and has 48 px touch targets on mobile sizes.

#### FE-1.2 App shell and routing

- **Week:** 1–2 · **Depends on:** FE-1.1
- **Build:** TanStack Router with a route tree per module (`core`, `slis`, `me`, `blis`); desktop layout with top bar (module switcher, scope picker, global search placeholder, notifications placeholder, profile menu) and a side nav per module; responsive collapse on tablets; error boundary and a not-found page; mock layer switch (MSW on or off per feature).
- **Done when:** navigation works across placeholder pages at 360 px, 768 px and 1280 px; the scope picker changes a scope value held in app state.

#### FE-1.3 Sign-in and permissions in the UI

- **Week:** 2 · **Depends on:** FE-1.2; backend BE-1.3 and BE-1.4 (mocks until then)
- **Build:** sign-in page, TOTP step for admins, session refresh handled inside `@idmis/api-client` (retry once on 401 after refresh), sign-out, route guards, a `useCan('slis.farmer.create')` hook from `/auth/me/abilities` that hides menus and buttons, a "you don't have access" page.
- **Done when:** works against the real API by end of week 2; an expired session sends the user to sign-in and back to where they were.

#### FE-1.4 Data patterns

- **Week:** 2–3 · **Depends on:** FE-1.1
- **Build:** in `packages/ui/patterns`: **RecordList** (TanStack Table, server cursor pagination, filter bar, saved filters, column chooser, row selection with bulk actions, Export and Import buttons, status chips); **RecordDetail** (summary header, tabs for details, related, files and history, status timeline); **Form** (react-hook-form with the contract's Zod schema, field errors, unsaved-changes warning); **StepForm** (progress bar, one group per step, autosave hook); **ConfirmDialog**.
- **Done when:** each pattern has a story using mock data and a unit test for its main behaviour.

#### FE-1.5 Admin screens

- **Week:** 3 · **Depends on:** FE-1.3, FE-1.4; backend BE-1.6
- **Build:** users list and detail; the assignment editor (role × module × scope: national, state, RBDA, scheme, sector; offline-capture flag) with a preview of what the user will see; organisations tree; WUAs and officers; lookups; settings (offline-capture days).
- **Done when:** an admin can create a state-scoped State Coordinator end to end on the real API.

#### FE-1.6 Import wizard

- **Week:** 3 · **Depends on:** FE-1.4; backend BE-1.8
- **Build:** a reusable five-step wizard: Choose (dataset, scope, required columns, sample row) → Template (download) → Upload (drag and drop, live progress over server-sent events) → Preview (totals, error grid with highlighted cells and messages on hover, download error file, re-upload, continue with valid rows) → Done (batch number, links, Undo batch). Plus an Imports tray in the top bar listing recent batches.
- **Done when:** the WUA import gate scenario passes on the real API, including undo.

#### FE-1.7 i18n setup

- **Week:** 3 · **Depends on:** FE-1.2
- **Build:** i18next with English resource files per module; a lint rule or check that flags hard-coded user-facing strings in JSX; date and number formatting for Nigeria (en-NG, ₦).
- **Done when:** every string in the shell, sign-in and admin screens comes from resource files.

## 2. Phase 2 — PWA, offline and SLIS (weeks 4–8)

**Gate (field pilot):** at one scheme, collectors install the app, register farmers and plots with no signal, and the records sync when signal returns; a Scheme Data Officer approves or returns them; a test run of 500 queued records loses none.

#### FE-2.1 Installable PWA and field layout

- **Week:** 4 · **Depends on:** Phase 1
- **Build:** vite-plugin-pwa with app manifest (name, icons, theme colour) and Workbox precaching of the app shell; install prompt; "new version available" banner that never reloads during a form; field layout with bottom bar (Home, Capture, My records, Sync, Me) used on phones and by users with the offline-capture permission.
- **Done when:** the app installs on a low-end Android phone and opens in airplane mode after the first visit; Lighthouse PWA checks pass.

#### FE-2.2 Offline data layer

- **Week:** 4–6 · **Depends on:** FE-2.1; backend sync contracts (week 6), mocks before
- **Build:** in `packages/sync` and `apps/web/src/offline`: Dexie database (reference data, own records, outbox, photo queue, meta); UUIDv7 ids created on the device; outbox ops `{opId, entity, recordId, baseVersion, payload}`; sync runner (push in batches, apply per-op results, then pull by cursor) triggered on reconnect, on app open and by a Sync now button; photo queue with compression to about 1600 px and resumable chunked upload; offline allowance countdown and lock screen when it expires; queued records never deleted on lock.
- **Done when:** unit tests with fake-indexeddb cover: retry sends the same opId; a rejected op returns the record to Needs fixing; a conflict shows as Conflict; closing the app mid-sync loses nothing.

#### FE-2.3 Farmer registration (field)

- **Week:** 5 · **Depends on:** FE-2.2, FE-1.4; backend SLIS contracts
- **Build:** the seven-step form from the design flows: Identity → Household → Location (ward from cached list, village, GPS) → WUA and group → Identity documents (add any number; pick type: NIN, BVN, voter's card, bank account, driver's licence, other; number; optional document photo; or skip) → Photos → Review. Autosave each step to the device; duplicate warning against cached records; Submit → Saved on device.
- **Done when:** a farmer can be registered start to finish in airplane mode, and validation messages match the contract exactly.

#### FE-2.4 Plot mapping (field)

- **Week:** 5–6 · **Depends on:** FE-2.2
- **Build:** MapLibre map with offline-tolerant base layer; Drop a point or Walk the boundary (records GPS points, shows accuracy, lets the collector undo the last point); area computed on the device with Turf; irrigation and service type, crop, season; allocation to a farmer.
- **Done when:** walking a test boundary gives an area within 2% of the server's calculation.

#### FE-2.5 Other field forms, My records, Sync centre

- **Week:** 6–7 · **Depends on:** FE-2.2
- **Build:** forms for water requests, fee collection (receipt number), training attendance, crop production; My records with status chips and filters; Sync centre (queued, failed, returned, last sync, storage used, days left offline, Retry, Sync now); returned records open straight into edit with the reviewer's comment.
- **Done when:** every form works offline; the Sync centre numbers match the outbox.

#### FE-2.6 SLIS desktop screens

- **Week:** 6–7 · **Depends on:** FE-1.4; backend BE-2.2–2.4
- **Build:** lists and details for farmers (identity numbers masked unless permitted), households, plots, water requests, fees, trainings, crop production; split list-and-map workspace for plots; Import buttons wired to the wizard for each SLIS dataset.
- **Done when:** all screens run on the real API with scope applied; masked numbers never appear unmasked without permission.

#### FE-2.7 Review queue and conflict view

- **Week:** 7–8 · **Depends on:** FE-2.6; backend BE-2.5, BE-2.6
- **Build:** review queue (filters by collector, sector, type, date; bulk approve; return with required comment); record review panel with photos, map pin and changes since last version; conflict view with device and server versions side by side, pick per field, save.
- **Done when:** the gate's approve and return loop works on the real API from phone to desktop and back.

#### FE-2.8 SLIS reports

- **Week:** 8 · **Depends on:** backend BE-2.8
- **Build:** report pages for farmers by sector and unit, WUA summaries and fee collection vs billing, each with filters, charts where useful and Export.
- **Done when:** figures match the backend report endpoints for the same filters.

## 3. Phase 3 — M&E (weeks 9–11)

**Gate:** one full quarter is entered, computed and approved for at least one scheme and one state, and the indicator matrix on screen matches a hand calculation.

#### FE-3.1 Results framework and indicators

- **Week:** 9 · **Depends on:** backend M&E contracts (mocks until BE-3.2)
- **Build:** framework view grouping PDO and intermediate indicators; indicator detail (code, unit, method: manual, computed or survey; baseline; targets by year and scope); target editor and target import.
- **Done when:** all 22 seeded indicators display correctly with their method badges.

#### FE-3.2 Quarterly entry

- **Week:** 9–10 · **Depends on:** FE-3.1; backend BE-3.2, BE-3.3
- **Build:** grid for a chosen quarter and scope: indicator, target, last value, this quarter; computed values pre-filled, locked and marked Computed, with a link to the source breakdown; manual values editable; notes and evidence uploads per value; Submit; approve or return for State Coordinators and the Programme Manager.
- **Done when:** the gate quarter is entered and approved on the real API.

#### FE-3.3 Indicator matrix

- **Week:** 10–11 · **Depends on:** FE-3.2
- **Build:** target vs actual by year and scope with traffic-light status (on track, at risk, off track; thresholds agreed with the client), drill-down to the values and their sources, Excel export, print-friendly layout.
- **Done when:** matrix figures equal the backend's `mv_indicator_matrix` for the same scope.

#### FE-3.4 Surveys

- **Week:** 10–11 · **Depends on:** FE-2.2; backend BE-3.4
- **Build:** desktop survey builder (questions, types, options, order, required); survey capture in the field app rendered from the questionnaire, offline, through the same outbox; responses list.
- **Done when:** a survey built on desktop can be completed offline on a phone and syncs with every answer type validated.

#### FE-3.5 Scorecards, grants and adoption

- **Week:** 11 · **Depends on:** backend BE-3.5
- **Build:** lists, forms and imports for scorecards (publish with file), matching grants and technology adoption.
- **Done when:** all three run on the real API with imports.

## 4. Phase 4 — BLIS (weeks 12–14)

**Gate:** a basin officer imports a year of readings, records a dam inspection, and sees stations and dams on the map with their latest status.

#### FE-4.1 Map workspace

- **Week:** 12–13 · **Depends on:** backend BE-4.5 (mock GeoJSON until then)
- **Build:** a reusable MapWorkspace pattern in `packages/ui/maps`: vector-tile layers from the API (basins, schemes, sectors, plots, stations, dams), layer panel with toggles, legend, filters, click to open a record, split list; stations coloured by latest status and dams by last inspection result.
- **Done when:** all layers load as tiles on the real API and a scheme-scoped user sees only their plots.

#### FE-4.2 Basins, stations, reservoirs and dams

- **Week:** 12 · **Depends on:** backend BE-4.2
- **Build:** lists and details for basins (with morphometry history), stations, reservoirs, dams, bio-resources, water-use priorities and stakeholders; station import.
- **Done when:** every BLIS record type can be created, edited and viewed on the real API.

#### FE-4.3 Time-series charts

- **Week:** 13 · **Depends on:** backend BE-4.3
- **Build:** station page with an ECharts time series per parameter; range picker and daily, monthly or yearly aggregation; gaps shown as breaks and suspect readings marked; measurement import from the station page.
- **Done when:** a year of readings renders in under one second on a mid-range laptop.

#### FE-4.4 Dam inspection form

- **Week:** 13–14 · **Depends on:** backend BE-4.4
- **Build:** inspection form on desktop and in the field app (offline): hazard class, a rating per component, staff and budget, next due date, photos; inspection history per dam.
- **Done when:** an inspection captured offline syncs and updates the dam's colour on the map.

#### FE-4.5 Layer upload

- **Week:** 14 · **Depends on:** backend BE-4.5
- **Build:** upload a zipped shapefile or GeoJSON, name it, pick its type and basin, preview on the map before saving.
- **Done when:** an uploaded layer appears in the layer panel for users in scope.

## 5. Phase 5 — Launch readiness (weeks 15–16)

**Gate (go-live):** every role's journey passes end to end on staging, the field app is fast on a low-end phone, and accessibility checks are clean.

#### FE-5.1 Role dashboards

- **Week:** 15 · **Depends on:** backend BE-5.1
- **Build:** programme, state and scheme dashboards: farmers registered, area under irrigation, fee recovery, indicator progress and dam status; every figure drills into the list behind it.
- **Done when:** dashboard numbers equal the list counts they drill into.

#### FE-5.2 Performance

- **Week:** 15 · **Depends on:** all features
- **Build:** route-level code splitting; lazy-load maps and charts; image and font optimisation; bundle-size budget in CI; testing on a low-end Android over throttled 3G.
- **Done when:** first load under 1.5 MB gzipped; the field app's Capture screen is usable within 3 seconds on the test phone.

#### FE-5.3 Accessibility and states

- **Week:** 15–16 · **Depends on:** all features
- **Build:** axe checks on every page template; keyboard-only pass through the main journeys; review of every empty, loading, error, offline and no-permission state against the design flows.
- **Done when:** no serious or critical axe findings; every state in the design-flows table is implemented.

#### FE-5.4 End-to-end journeys

- **Week:** 16 · **Depends on:** all features
- **Build:** Playwright journeys for each role: collector (offline capture → reconnect → sync), Scheme Data Officer (review, conflict), M&E Officer (quarter), Basin Officer (readings, inspection), State Coordinator (state overview), System Administrator (users, import); run in CI against staging.
- **Done when:** all journeys pass twice in a row.

#### FE-5.5 Language readiness and user guide

- **Week:** 16 · **Depends on:** FE-1.7
- **Build:** confirm every string is externalised and translation files exist for Hausa, Yoruba and Igbo (keys only, ready for translators); screenshots for a short user guide per role.
- **Done when:** switching language shows key names instead of hard-coded English anywhere, and the guide screenshots are in `docs/user-guide/`.

## 6. Backend handoffs and tracker

### 6.1 What you need from the backend, and when

Until each item lands, keep building on mocks. If a date slips, the backend developer tells you the same day.

| Week | Backend delivers                       | You switch off mocks for                     |
| ---- | -------------------------------------- | -------------------------------------------- |
| 1    | Auth and core contracts merged         | (start mocks for sign-in and admin)          |
| 2    | Sign-in, refresh, `/auth/me/abilities` | Sign-in, menus by permission                 |
| 3    | Core admin APIs and import engine      | Admin screens, import wizard                 |
| 4    | SLIS contracts merged                  | (start mocks for field forms and SLIS lists) |
| 6    | Sync contracts merged                  | (build outbox and sync runner on mocks)      |
| 7    | Sync server on staging                 | Real offline → sync testing on phones        |
| 8    | Review queue and reports               | Review, conflict and report screens          |
| 9    | M&E contracts merged                   | (start mocks for quarterly entry)            |
| 11   | Computed values and surveys            | Quarter gate test, surveys                   |
| 12   | BLIS contracts merged                  | (start mocks for BLIS screens)               |
| 14   | Vector tiles and readings              | Map workspace, charts                        |
| 15   | Dashboard endpoints                    | Role dashboards                              |

### 6.2 Task tracker

Update the status as you go; link the PR in the last column.

| ID     | Task                                 | Week  | Status      | PR  |
| ------ | ------------------------------------ | ----- | ----------- | --- |
| FE-1.1 | Design tokens and base components    | 1     | Not started |     |
| FE-1.2 | App shell and routing                | 1–2   | Not started |     |
| FE-1.3 | Sign-in and permissions in the UI    | 2     | Not started |     |
| FE-1.4 | Data patterns                        | 2–3   | Not started |     |
| FE-1.5 | Admin screens                        | 3     | Not started |     |
| FE-1.6 | Import wizard                        | 3     | Not started |     |
| FE-1.7 | i18n setup                           | 3     | Not started |     |
| FE-2.1 | Installable PWA and field layout     | 4     | Not started |     |
| FE-2.2 | Offline data layer                   | 4–6   | Not started |     |
| FE-2.3 | Farmer registration (field)          | 5     | Not started |     |
| FE-2.4 | Plot mapping (field)                 | 5–6   | Not started |     |
| FE-2.5 | Field forms, My records, Sync centre | 6–7   | Not started |     |
| FE-2.6 | SLIS desktop screens                 | 6–7   | Not started |     |
| FE-2.7 | Review queue and conflict view       | 7–8   | Not started |     |
| FE-2.8 | SLIS reports                         | 8     | Not started |     |
| FE-3.1 | Results framework and indicators     | 9     | Not started |     |
| FE-3.2 | Quarterly entry                      | 9–10  | Not started |     |
| FE-3.3 | Indicator matrix                     | 10–11 | Not started |     |
| FE-3.4 | Surveys                              | 10–11 | Not started |     |
| FE-3.5 | Scorecards, grants, adoption         | 11    | Not started |     |
| FE-4.1 | Map workspace                        | 12–13 | Not started |     |
| FE-4.2 | Basins, stations, reservoirs, dams   | 12    | Not started |     |
| FE-4.3 | Time-series charts                   | 13    | Not started |     |
| FE-4.4 | Dam inspection form                  | 13–14 | Not started |     |
| FE-4.5 | Layer upload                         | 14    | Not started |     |
| FE-5.1 | Role dashboards                      | 15    | Not started |     |
| FE-5.2 | Performance                          | 15    | Not started |     |
| FE-5.3 | Accessibility and states             | 15–16 | Not started |     |
| FE-5.4 | End-to-end journeys                  | 16    | Not started |     |
| FE-5.5 | Language readiness and user guide    | 16    | Not started |     |
