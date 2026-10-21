TRIMING IDMIS 2.0 — System Architecture

ES2 Limited · Oct 20, 2026 · @Saifur-Rahman Yusuf

IDMIS 2.0 is one codebase (a monorepo) that deploys as three services on Railway: web, api and worker. They share a PostgreSQL database and a Redis queue; files live in Cloudflare R2. This doc maps each part of the code to what runs, shows how requests, offline sync and imports move through the system, and explains the concepts and decisions behind it. The database is specified in the companion doc, TRIMING IDMIS 2.0 — Database Schema.

1. System at a glance

system context · users, Railway services, outside services

| Part | What it does | Talks to |

Part

What it does

Talks to

| web | The React PWA: desktop workspace and field app. A static build served over HTTPS; installs on phones and runs offline | api (REST, JSON) |

web

The React PWA: desktop workspace and field app. A static build served over HTTPS; installs on phones and runs offline

api (REST, JSON)

| api | NestJS server: sign-in, permissions, every read and write, sync endpoints, import endpoints | PostgreSQL, Redis (adds jobs), R2 (file links), email |

api

NestJS server: sign-in, permissions, every read and write, sync endpoints, import endpoints

PostgreSQL, Redis (adds jobs), R2 (file links), email

| worker | Runs slow or scheduled work off the request path: import validation and commit, exports, PDF reports, nightly indicator computation, event delivery, nightly backup dump | Redis (takes jobs), PostgreSQL, R2 |

worker

Runs slow or scheduled work off the request path: import validation and commit, exports, PDF reports, nightly indicator computation, event delivery, nightly backup dump

Redis (takes jobs), PostgreSQL, R2

| PostgreSQL + PostGIS | All data, one schema per module, plus maps and geometry | — |

PostgreSQL + PostGIS

All data, one schema per module, plus maps and geometry

—

| Redis | Job queues between api and worker | — |

Redis

Job queues between api and worker

—

| R2 | Photos, identity-document images, shapefiles, import files, generated reports, backup dumps | — |

R2

Photos, identity-document images, shapefiles, import files, generated reports, backup dumps

—

| Sentry | Error and performance tracking for web, api and worker | — |

Sentry

Error and performance tracking for web, api and worker

—

2. How the repo maps to what runs

repo to runtime · folders, builds, Railway services

One push to main can update all three services. Turborepo works out which apps a change touches and only rebuilds those.

idmis/├── apps/│ ├── web/ → Railway service "web" (static)│ ├── api/ → Railway service "api" (Docker, public)│ └── worker/ → Railway service "worker" (Docker, private)├── packages/│ ├── contracts/ → bundled into web, api, worker│ ├── db/ → schema used by api + worker; migrations run before api starts│ ├── ui/ → bundled into web│ ├── sync/ → bundled into web (and tests)│ ├── api-client/→ generated from the api's OpenAPI spec, bundled into web│ └── config/ → lint and TypeScript settings, build-time only├── tests/ → run in CI, never deployed├── infra/ → Dockerfiles, local compose, Railway service settings└── docs/ → ADRs and runbooks

| Railway service | Root directory | Build | Start | Public URL |

Railway service

Root directory

Build

Start

Public URL

| web | apps/web | pnpm turbo build --filter=web | Static files served by Railway | Yes, e.g. idmis domain |

web

apps/web

pnpm turbo build --filter=web

Static files served by Railway

Yes, e.g. idmis domain

| api | repo root | infra/docker/api.Dockerfile | node dist/main.js, after drizzle-kit migrate | Yes, e.g. api subdomain |

api

repo root

infra/docker/api.Dockerfile

node dist/main.js, after drizzle-kit migrate

Yes, e.g. api subdomain

| worker | repo root | infra/docker/worker.Dockerfile | node dist/main.js | No |

worker

repo root

infra/docker/worker.Dockerfile

node dist/main.js

No

| Postgres | — | Railway plugin with PostGIS | — | Private network only |

Postgres

—

Railway plugin with PostGIS

—

Private network only

| Redis | — | Railway plugin | — | Private network only |

Redis

—

Railway plugin

—

Private network only

The api and worker share one Docker base and the same packages/db and packages/contracts, so the code that writes a row and the code that processes it in the background always agree on its shape.

3. Inside the API

request lifecycle · guards, service, repository, event path

Every endpoint goes through the same layers, so a developer (or an AI agent) adding a feature cannot skip a check.

| Layer | Lives in | Rule |

Layer

Lives in

Rule

| Auth guard | apps/api/src/platform/auth | Global; every route is private unless marked public (sign-in, health) |

Auth guard

apps/api/src/platform/auth

Global; every route is private unless marked public (sign-in, health)

| Permission guard | platform/rbac | Each route declares its permission, e.g. @Can('slis.farmer.create') |

Permission guard

platform/rbac

Each route declares its permission, e.g. @Can('slis.farmer.create')

| Validation pipe | platform/validation + packages/contracts | Body and query parsed with the contract's Zod schema; unknown fields rejected |

Validation pipe

platform/validation + packages/contracts

Body and query parsed with the contract's Zod schema; unknown fields rejected

| Controller | modules/<module>/controllers | No business logic, no database calls |

Controller

modules/<module>/controllers

No business logic, no database calls

| Service | modules/<module>/services | Business rules; opens the transaction; writes the audit row and outbox events |

Service

modules/<module>/services

Business rules; opens the transaction; writes the audit row and outbox events

| Repository | modules/<module>/repositories | The only place that queries tables; always applies the caller's scope |

Repository

modules/<module>/repositories

The only place that queries tables; always applies the caller's scope

| Public service | modules/<module>/public | Read-only queries other modules may call; also scope-aware |

Public service

modules/<module>/public

Read-only queries other modules may call; also scope-aware

| Subscriber | modules/<module>/subscribers | Reacts to other modules' events; must be safe to run twice |

Subscriber

modules/<module>/subscribers

Reacts to other modules' events; must be safe to run twice

A write either fully happens (data, audit row and event together) or not at all. Events are delivered after commit by the worker, so a slow subscriber never slows the user's request.

4. How one feature maps across the repo

feature path · one schema, four consumers

Example: adding farmer marital status. Every feature follows the same path, in this order:

packages/contracts/slis/farmer.ts: add the field and its rule to the Zod schema, and the column to the farmer import definition.

packages/db/schema/slis.ts: add the column; drizzle-kit generate writes the migration.

apps/api/src/modules/slis: nothing to change for simple fields; the validation pipe and repository pick it up. Add logic in the service only if the field has rules.

apps/web/src/modules/slis/forms/farmer: add the input to the step form; the same schema checks it offline.

Import template: regenerates automatically with the new column and its dropdown.

Tests: a schema unit test and one API test; the Playwright journey covers the form.

4.1 Where a module lives

| Module | API | Web | Database schema | Contracts |

Module

API

Web

Database schema

Contracts

| Core | apps/api/src/modules/core | apps/web/src/modules/core (Admin) | core | packages/contracts/core |

Core

apps/api/src/modules/core

apps/web/src/modules/core (Admin)

core

packages/contracts/core

| SLIS | modules/slis | modules/slis + field app | slis | contracts/slis |

SLIS

modules/slis

modules/slis + field app

slis

contracts/slis

| M&E | modules/me | modules/me | me | contracts/me |

M&E

modules/me

modules/me

me

contracts/me

| BLIS | modules/blis | modules/blis | blis | contracts/blis |

BLIS

modules/blis

modules/blis

blis

contracts/blis

| Procurement (later) | modules/proc | modules/proc | proc | contracts/proc |

Procurement (later)

modules/proc

modules/proc

proc

contracts/proc

Cross-module reads go through modules/<other>/public/ only. The ESLint boundaries rule fails the build on any other import between modules.

5. Offline architecture

offline architecture · phone stores and sync endpoints

The phone never asks the server before saving. It keeps its own copy of what the collector needs, queues changes, and swaps changes with the server whenever it can.

| Piece | Code | What it does |

Piece

Code

What it does

| Local store | apps/web/src/offline/db.ts (Dexie) | Tables for the collector's records and scoped reference data (schemes, WUAs, wards, crop types, document types) |

Local store

apps/web/src/offline/db.ts (Dexie)

Tables for the collector's records and scoped reference data (schemes, WUAs, wards, crop types, document types)

| Outbox | offline/outbox.ts + packages/sync | Each save adds {opId, entity, recordId, baseVersion, payload}; survives app close and restarts |

Outbox

offline/outbox.ts + packages/sync

Each save adds {opId, entity, recordId, baseVersion, payload}; survives app close and restarts

| Sync runner | offline/sync-runner.ts | Pushes the outbox in batches, applies per-op results, then pulls changes since the stored cursor |

Sync runner

offline/sync-runner.ts

Pushes the outbox in batches, applies per-op results, then pulls changes since the stored cursor

| Photo queue | offline/files.ts | Compresses to ~1600 px JPEG, uploads in chunks to presigned R2 links, resumes after drop-outs |

Photo queue

offline/files.ts

Compresses to ~1600 px JPEG, uploads in chunks to presigned R2 links, resumes after drop-outs

| Service worker | apps/web/src/sw (Workbox) | Caches the app shell so it opens with no signal; triggers sync when the connection returns |

Service worker

apps/web/src/sw (Workbox)

Caches the app shell so it opens with no signal; triggers sync when the connection returns

| Push endpoint | apps/api/src/sync/push | Validates each op with the contract schema, checks baseVersion, saves or records a conflict, writes change_log |

Push endpoint

apps/api/src/sync/push

Validates each op with the contract schema, checks baseVersion, saves or records a conflict, writes change_log

| Pull endpoint | apps/api/src/sync/pull | Returns rows from change_log after the device's cursor, filtered to the user's scope |

Pull endpoint

apps/api/src/sync/pull

Returns rows from change_log after the device's cursor, filtered to the user's scope

Three properties keep it safe:

Idempotent: a retried op with the same opId is answered from the first result, never applied twice.

No silent overwrite: an op based on an old version becomes a conflict for a person to resolve.

Scoped: a device only ever receives data inside its user's scope, so a lost phone exposes as little as possible.

6. Import pipeline

import sequence · browser, API, R2, worker, database

The API never parses a large spreadsheet inside a web request. It stores the file, queues a job and returns at once; the worker does the heavy lifting and the browser follows progress live.

| Step | Code | Notes |

Step

Code

Notes

| Template | apps/api/src/imports + packages/contracts/<module>/imports | ExcelJS builds Data, hidden Lists and Instructions sheets; version stamped in the file |

Template

apps/api/src/imports + packages/contracts/<module>/imports

ExcelJS builds Data, hidden Lists and Instructions sheets; version stamped in the file

| Upload | imports controller | File type and size checked; virus scan; stored in R2; core.import_batch row created |

Upload

imports controller

File type and size checked; virus scan; stored in R2; core.import_batch row created

| Validate | apps/worker/src/jobs/import-validate | Streams rows, applies the contract schema, resolves lookups within scope, finds duplicates; writes core.import_row |

Validate

apps/worker/src/jobs/import-validate

Streams rows, applies the contract schema, resolves lookups within scope, finds duplicates; writes core.import_row

| Progress | Server-sent events from the API | Reads batch counters; browser shows a live bar, then the preview grid |

Progress

Server-sent events from the API

Reads batch counters; browser shows a live bar, then the preview grid

| Commit | jobs/import-commit | Upserts on the natural key in chunks of 1,000 per transaction; tags rows with import_batch_id; emits module events |

Commit

jobs/import-commit

Upserts on the natural key in chunks of 1,000 per transaction; tags rows with import_batch_id; emits module events

| Undo | jobs/import-revert | Removes or restores rows by batch id, refused if any row was edited after import |

Undo

jobs/import-revert

Removes or restores rows by batch id, refused if any row was edited after import

7. Security, environments and delivery

7.1 Security layers

| Layer | Control |

Layer

Control

| Transport | HTTPS everywhere; Postgres and Redis reachable only on Railway's private network |

Transport

HTTPS everywhere; Postgres and Redis reachable only on Railway's private network

| Identity | Argon2id password hashes; 15-minute access tokens; rotating refresh tokens in httpOnly cookies, revocable per device; TOTP required for System Administrators |

Identity

Argon2id password hashes; 15-minute access tokens; rotating refresh tokens in httpOnly cookies, revocable per device; TOTP required for System Administrators

| Authorisation | Permission guard on every route; scope filter in every repository; deny by default |

Authorisation

Permission guard on every route; scope filter in every repository; deny by default

| Input | Zod validation at the API edge; parameterised queries only (Drizzle); strict Content Security Policy in the web app |

Input

Zod validation at the API edge; parameterised queries only (Drizzle); strict Content Security Policy in the web app

| Sensitive data | Identity numbers (NIN, BVN, voter's card, bank account) encrypted in the application before storage, masked on screen without *.identity.view |

Sensitive data

Identity numbers (NIN, BVN, voter's card, bank account) encrypted in the application before storage, masked on screen without *.identity.view

| Files | Type checked by content, virus-scanned, served only through short-lived signed links |

Files

Type checked by content, virus-scanned, served only through short-lived signed links

| Abuse | Rate limits on sign-in, sync and import; lockout after 5 failed sign-ins for 15 minutes |

Abuse

Rate limits on sign-in, sync and import; lockout after 5 failed sign-ins for 15 minutes

| Accountability | Audit log of every change and every assignment change; sign-ins and failures logged without password material |

Accountability

Audit log of every change and every assignment change; sign-ins and failures logged without password material

| Secrets | Railway environment variables only; nothing in the repo; dependency and container scanning in CI |

Secrets

Railway environment variables only; nothing in the repo; dependency and container scanning in CI

7.2 Environments

| Environment | Where | Data | Deploys |

Environment

Where

Data

Deploys

| Local | Developer machine, infra/compose.dev.yml (Postgres + PostGIS, Redis, MinIO for R2) | Seed and demo data | On save |

Local

Developer machine, infra/compose.dev.yml (Postgres + PostGIS, Redis, MinIO for R2)

Seed and demo data

On save

| Staging | Railway project "idmis-staging" | Anonymised seed data | Every merge to main |

Staging

Railway project "idmis-staging"

Anonymised seed data

Every merge to main

| Production | Railway project "idmis-prod" | Live data | Tagged release, after staging checks pass |

Production

Railway project "idmis-prod"

Live data

Tagged release, after staging checks pass

7.3 Delivery pipeline

Pull request opened: lint, type-check, module-boundary rule, unit and API tests (Testcontainers), bundle-size budget.

Review: one human approval; a second for changes to auth, permissions, sync, import commit or migrations.

Merge to main: build the changed apps, run Playwright journeys (including offline → sync), deploy to staging; migrations run before the api starts.

Release tag: the same images promote to production; migrations run first; health checks gate the switch.

After release: Sentry and uptime alerts watched; rollback = redeploy the previous image (migrations are written to be backward-compatible for one release).

7.4 Backups and recovery

Railway volume backups, plus a nightly encrypted pg_dump written by the worker to R2.

Recovery point: up to 24 hours (1 hour once WAL archiving to R2 is added). Recovery time target: 4 hours.

Restore is rehearsed quarterly into staging, following docs/runbooks/restore.md.

8. Concepts explained

| Concept | Plain meaning | Where it shows up in IDMIS |

Concept

Plain meaning

Where it shows up in IDMIS

| Monorepo | All the code for every app lives in one repository, with shared packages | apps/ and packages/; one pull request can change phone, server and database together |

Monorepo

All the code for every app lives in one repository, with shared packages

apps/ and packages/; one pull request can change phone, server and database together

| Modular monolith | One deployable server, split inside into modules with hard walls between them | apps/api/src/modules/*; a module can later move to its own service without a rewrite |

Modular monolith

One deployable server, split inside into modules with hard walls between them

apps/api/src/modules/*; a module can later move to its own service without a rewrite

| Module boundary | A module's tables and internal code are private; others use only its public/ folder | ESLint boundaries rule; no foreign keys between business modules |

Module boundary

A module's tables and internal code are private; others use only its public/ folder

ESLint boundaries rule; no foreign keys between business modules

| PWA (progressive web app) | A website that installs like an app and works offline | The field app: added to the phone's home screen, opens with no signal |

PWA (progressive web app)

A website that installs like an app and works offline

The field app: added to the phone's home screen, opens with no signal

| Service worker | A small background script in the browser that caches files and wakes up when the network returns | apps/web/src/sw; keeps the app shell available offline and triggers sync |

Service worker

A small background script in the browser that caches files and wakes up when the network returns

apps/web/src/sw; keeps the app shell available offline and triggers sync

| IndexedDB / Dexie | A database inside the browser; Dexie is a friendly wrapper for it | The phone's local store and outbox |

IndexedDB / Dexie

A database inside the browser; Dexie is a friendly wrapper for it

The phone's local store and outbox

| Outbox (on the phone) | A queue of changes waiting to be sent | Every offline save adds one entry; sync drains it |

Outbox (on the phone)

A queue of changes waiting to be sent

Every offline save adds one entry; sync drains it

| Outbox pattern (on the server) | Save the event in the same database transaction as the data, then deliver it afterwards | Guarantees M&E hears about every approved fee or farmer, even if the worker was down |

Outbox pattern (on the server)

Save the event in the same database transaction as the data, then deliver it afterwards

Guarantees M&E hears about every approved fee or farmer, even if the worker was down

| Idempotency | Doing the same request twice has the same effect as doing it once | opId on sync, Idempotency-Key on writes: retries on bad networks never duplicate records |

Idempotency

Doing the same request twice has the same effect as doing it once

opId on sync, Idempotency-Key on writes: retries on bad networks never duplicate records

| Optimistic concurrency | Each record has a version number; an update must say which version it started from | Stale updates are refused (409) or become sync conflicts instead of overwriting newer data |

Optimistic concurrency

Each record has a version number; an update must say which version it started from

Stale updates are refused (409) or become sync conflicts instead of overwriting newer data

| UUIDv7 | A unique id that can be created anywhere, including offline on a phone, and still sorts by time | Every primary key; records get their id before they ever reach the server |

UUIDv7

A unique id that can be created anywhere, including offline on a phone, and still sorts by time

Every primary key; records get their id before they ever reach the server

| RBAC + scope | Role-based access control (what you may do) combined with scope (which data) | Role × module × scope assignments; state scope cuts across RBDAs |

RBAC + scope

Role-based access control (what you may do) combined with scope (which data)

Role × module × scope assignments; state scope cuts across RBDAs

| CASL | A library that turns a user's permissions into an "ability" checked in code | Built per request in the api; the same rules hide buttons in the web app |

CASL

A library that turns a user's permissions into an "ability" checked in code

Built per request in the api; the same rules hide buttons in the web app

| Contract (Zod schema) | A single, typed description of a record and its rules | packages/contracts; used by forms, API and importer alike |

Contract (Zod schema)

A single, typed description of a record and its rules

packages/contracts; used by forms, API and importer alike

| Job queue (BullMQ + Redis) | A to-do list for background work, processed by the worker | Imports, exports, PDF reports, nightly indicator computation, event delivery |

Job queue (BullMQ + Redis)

A to-do list for background work, processed by the worker

Imports, exports, PDF reports, nightly indicator computation, event delivery

| PostGIS | Map and geometry support inside PostgreSQL | Plot boundaries, station points, basin outlines, distance and area queries |

PostGIS

Map and geometry support inside PostgreSQL

Plot boundaries, station points, basin outlines, distance and area queries

| Vector tiles | Map data sent in small square pieces at the zoom level needed | Map layers served from PostGIS, drawn in the browser with MapLibre |

Vector tiles

Map data sent in small square pieces at the zoom level needed

Map layers served from PostGIS, drawn in the browser with MapLibre

| Migration | A versioned script that changes the database structure | packages/db/migrations; runs automatically before each api release |

Migration

A versioned script that changes the database structure

packages/db/migrations; runs automatically before each api release

9. Decisions

Each row is written up in full as an ADR in docs/adr/.

| # | Decision | Alternatives considered | Why | Trade-off we accept |

#

Decision

Alternatives considered

Why

Trade-off we accept

| 1 | Monorepo with pnpm + Turborepo | Separate repos for web and api | Shared contracts across phone, API and importer; one PR per feature; AI agents see the whole contract | Repo access is all-or-nothing; CI needs change detection |

1

Monorepo with pnpm + Turborepo

Separate repos for web and api

Shared contracts across phone, API and importer; one PR per feature; AI agents see the whole contract

Repo access is all-or-nothing; CI needs change detection

| 2 | Modular monolith, not microservices | One microservice per module | One deploy, one database, simple transactions; boundaries still enforced | Modules scale together; splitting later takes some work |

2

Modular monolith, not microservices

One microservice per module

One deploy, one database, simple transactions; boundaries still enforced

Modules scale together; splitting later takes some work

| 3 | TypeScript end to end (React + NestJS) | Laravel + Filament; Laravel API + React | Offline PWA logic is TypeScript anyway; one validation layer everywhere | Admin features (tables, forms, audit) are built, not bought |

3

TypeScript end to end (React + NestJS)

Laravel + Filament; Laravel API + React

Offline PWA logic is TypeScript anyway; one validation layer everywhere

Admin features (tables, forms, audit) are built, not bought

| 4 | NestJS for the API | Express or Fastify alone, Hono | Modules, dependency injection and guards map directly onto our module and permission model | More framework conventions to learn |

4

NestJS for the API

Express or Fastify alone, Hono

Modules, dependency injection and guards map directly onto our module and permission model

More framework conventions to learn

| 5 | PostgreSQL + PostGIS | MySQL (as in the legacy system), MongoDB | Strong integrity, per-module schemas, real geometry for plots and basins, materialised views for reports | Team must know PostGIS basics |

5

PostgreSQL + PostGIS

MySQL (as in the legacy system), MongoDB

Strong integrity, per-module schemas, real geometry for plots and basins, materialised views for reports

Team must know PostGIS basics

| 6 | Drizzle ORM | Prisma, TypeORM | SQL-first, typed, handles PostGIS, views and multiple schemas without workarounds | Less hand-holding than Prisma for beginners |

6

Drizzle ORM

Prisma, TypeORM

SQL-first, typed, handles PostGIS, views and multiple schemas without workarounds

Less hand-holding than Prisma for beginners

| 7 | Custom design system (Tailwind + Radix) | Admin template, Filament | Purpose-built field and desktop UI, accessible primitives | More design and build time up front |

7

Custom design system (Tailwind + Radix)

Admin template, Filament

Purpose-built field and desktop UI, accessible primitives

More design and build time up front

| 8 | Offline-first PWA, not native apps | React Native, Flutter | One codebase; no app-store releases; works on low-end Android | iOS background sync is weaker; Android is the field target |

8

Offline-first PWA, not native apps

React Native, Flutter

One codebase; no app-store releases; works on low-end Android

iOS background sync is weaker; Android is the field target

| 9 | Outbox pattern for cross-module events | Direct calls between modules; external message broker | Events never lost; no extra infrastructure | Events arrive seconds later, not instantly |

9

Outbox pattern for cross-module events

Direct calls between modules; external message broker

Events never lost; no extra infrastructure

Events arrive seconds later, not instantly

| 10 | Conflicts held for a person, not last-write-wins | Automatic last-write-wins | Field data is evidence; silent overwrites would corrupt it | Scheme Data Officers handle a small conflict queue |

10

Conflicts held for a person, not last-write-wins

Automatic last-write-wins

Field data is evidence; silent overwrites would corrupt it

Scheme Data Officers handle a small conflict queue

| 11 | Background worker for imports and reports | Process inside the request | Large files never time out; the web stays fast | One more service to run and monitor |

11

Background worker for imports and reports

Process inside the request

Large files never time out; the web stays fast

One more service to run and monitor

| 12 | Railway hosting + Cloudflare R2 | Own VPS, AWS, government data centre | Existing account; managed Postgres and Redis; low operations load | Tied to one provider; mitigated by nightly off-platform backups and Dockerised services |

12

Railway hosting + Cloudflare R2

Own VPS, AWS, government data centre

Existing account; managed Postgres and Redis; low operations load

Tied to one provider; mitigated by nightly off-platform backups and Dockerised services

| 13 | Application-level encryption of identity numbers | Database-level encryption only | Numbers stay unreadable even in a database dump or backup | Encrypted fields cannot be searched by partial number |

13

Application-level encryption of identity numbers

Database-level encryption only

Numbers stay unreadable even in a database dump or backup

Encrypted fields cannot be searched by partial number

| 14 | Greenfield, no legacy data migration | Migrate legacy MySQL data | Client direction; legacy data quality is poor | Historical records stay in the old system |

14

Greenfield, no legacy data migration

Migrate legacy MySQL data

Client direction; legacy data quality is poor

Historical records stay in the old system
