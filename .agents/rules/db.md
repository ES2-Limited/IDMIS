---
trigger: glob
globs:
  - 'packages/db/**'
---

# Database Guidelines (`packages/db`)

## 1. Schema & Isolation

- Each module has its own PostgreSQL schema: `core`, `slis`, `me`, `blis`.
- Schema definitions reside under `packages/db/src/schema/<module>.ts`.
- No cross-schema foreign keys. All cross-module relational lookups happen at the service layer.

## 2. Standard Table Columns

Every business table must define the following standard audit and concurrency fields:

- `id`: `uuid` populated with UUIDv7 values.
- `version`: `integer` default `1` not null (for optimistic locking).
- `created_at`: `timestamp with time zone` default `now()` not null.
- `created_by`: `uuid` not null.
- `updated_at`: `timestamp with time zone` default `now()` not null.
- `updated_by`: `uuid` not null.
- `deleted_at`: `timestamp with time zone` nullable (soft delete marker).
- `import_batch_id`: `uuid` nullable on import-enabled datasets.

## 3. Spatial Data & PostGIS

- All geospatial columns (boundary polygons, irrigation canals, points of interest, farm plots) must use PostGIS SRID 4326 (WGS 84).
- Use spatial indexes (`gist`) on geometric and geography columns.

## 4. Indexing Strategy

- Always create indexes on tenant-scoping columns: `scheme_id`, `state_id`.
- Composite indexes must place equality lookup columns first, followed by range/timestamp columns.
- Standard index naming convention: `idx_<table_name>_<column_names>`.

## 5. Migration Safety

- **Additive first**: Schema changes must be backward-compatible with running versions of the application.
- Renames or deletions must follow a multi-step release pattern:
  1. Add new column/table alongside old.
  2. Double-write in application layer if necessary.
  3. Backfill data via background script.
  4. Migrate read path to new column.
  5. Remove old column in a subsequent release.
- Never edit an existing migration file that has been applied or committed.
- All migrations must be generated via `pnpm db:generate` and reviewed by a human before applying to staging or production.
