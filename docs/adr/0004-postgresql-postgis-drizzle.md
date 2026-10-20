# ADR 0004: PostgreSQL + PostGIS with Drizzle ORM

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

IDMIS 2.0 requires robust relational data modeling alongside geographic information systems (GIS) capabilities to manage irrigation schemes, canal networks, command areas, and agricultural land parcels across Nigeria.

## Decision Drivers

- Strong ACID relational transactions for financial, scheme, and M&E records.
- Standardized spatial indexing, polygon intersections, and coordinate transformations.
- Light-weight, type-safe database queries with transparent SQL generation.

## Decision Outcome

Standardized on **PostgreSQL 16 with PostGIS 3.4**, accessed through **Drizzle ORM** and `postgres.js`:

- Spatial coordinates use PostGIS `geometry(Point, 4326)` or `geometry(Polygon, 4326)`.
- Database is partitioned by schema per module (`core`, `slis`, `me`, `blis`).
- Migrations are versioned and generated via Drizzle Kit (`pnpm db:generate`).

### Positive Consequences

- Drizzle offers zero-overhead SQL-like syntax with compile-time type inference from schema definitions.
- Spatial calculations (area computation, parcel containment checks) execute directly in the database engine.
- Migrations output plain SQL files that are human-readable, auditable, and version-controlled.

### Negative Consequences / Trade-offs

- PostGIS requires spatial extensions enabled in host/container databases. Provided out-of-the-box in `infra/compose.dev.yml` via `postgis/postgis:16-3.4`.
