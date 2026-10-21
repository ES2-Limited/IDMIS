import { customType, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Custom Postgres types
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const bytea = customType<{ data: Buffer | Uint8Array }>({
  dataType() {
    return 'bytea';
  },
});

export const geometryMultiPolygon = (name: string) =>
  customType<{ data: unknown }>({
    dataType() {
      return 'geometry(MultiPolygon, 4326)';
    },
  })(name);

export const geometryGeneric = (name: string) =>
  customType<{ data: unknown }>({
    dataType() {
      return 'geometry(Geometry, 4326)';
    },
  })(name);

/**
 * Standard audit and optimistic concurrency columns.
 * Every business table includes: id, version, created_at, created_by, updated_at, updated_by, deleted_at.
 */
export function standardColumns(appUserIdRef: () => AnyPgColumn) {
  return {
    id: uuid('id').primaryKey(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').notNull().references(appUserIdRef),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updated_by').notNull().references(appUserIdRef),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  };
}

/**
 * Standard columns for app_user where created_by / updated_by must be nullable
 * to allow seeding the first bootstrap administrator.
 */
export function standardUserColumns(appUserIdRef: () => AnyPgColumn) {
  return {
    id: uuid('id').primaryKey(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(appUserIdRef),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updated_by').references(appUserIdRef),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  };
}
