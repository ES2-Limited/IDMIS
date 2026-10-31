import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

const defaultPostgresOptions: postgres.Options<Record<string, postgres.PostgresType>> = {
  idle_timeout: 60,
  connection: {
    idle_in_transaction_session_timeout: 60000,
  },
};

let connectionString = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
export let client = postgres(connectionString, defaultPostgresOptions);
export let db = drizzle(client, { schema });

export function setDatabaseUrl(url: string) {
  connectionString = url;
  client = postgres(url, defaultPostgresOptions);
  db = drizzle(client, { schema });
  return db;
}

export * from './constants';
export * from './schema/index';
export * from 'drizzle-orm';
export type { AnyPgColumn, PgColumn } from 'drizzle-orm/pg-core';
export { alias } from 'drizzle-orm/pg-core';
export { default as postgres } from 'postgres';
export { drizzle } from 'drizzle-orm/postgres-js';
export { migrate } from 'drizzle-orm/postgres-js/migrator';
