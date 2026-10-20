# Database Package Guide (`packages/db`)

## Schema Isolation

- Each business domain maps to an isolated PostgreSQL schema: `core`, `slis`, `me`, `blis`.
- Cross-schema foreign keys and direct cross-schema SQL joins are strictly forbidden. Data joins across modules occur at the application service layer via public module APIs.

## Standard Columns

Every domain table must declare standard audit and concurrency fields:

- `id`: `uuid` populated with UUIDv7 (time-ordered sequential ID).
- `version`: `integer` default `1` not null (incremented on each update for optimistic locking).
- `created_at`: `timestamp with time zone` default `now()` not null.
- `created_by`: `uuid` not null referencing user ID.
- `updated_at`: `timestamp with time zone` default `now()` not null.
- `updated_by`: `uuid` not null referencing user ID.
- `deleted_at`: `timestamp with time zone` null (for soft deletes).
- `import_batch_id`: `uuid` nullable (required on any table that supports dataset imports).

## Naming Conventions

- Tables: snake_case, plural (e.g. `farmers`, `water_users_associations`).
- Columns: snake_case (e.g. `scheme_id`, `state_id`, `is_active`).
- Geographic coordinates: PostGIS `geometry(Point, 4326)` named `geom` or `location`.
- Indexes: `idx_<table_name>_<column_names>`. Always index scope columns (`scheme_id`, `state_id`).

## Migration Safety Rules

- **Never edit an applied migration**: Once a migration file is created and checked into git, it is immutable. Fixes require a new migration file.
- **Additive first**: Migrations must be non-breaking and backward compatible with running code. Column removals or renames occur across two separate releases.
- **Human Review**: Every migration SQL must be explicitly reviewed by a human engineer before applying to shared environments.
