import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

let connectionString = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
export let client = postgres(connectionString);
export let db = drizzle(client, { schema });

export function setDatabaseUrl(url: string) {
  connectionString = url;
  client = postgres(url);
  db = drizzle(client, { schema });
  return db;
}

export * from './constants';
export * from './schema/index';
export * from 'drizzle-orm';
export { default as postgres } from 'postgres';
export { drizzle } from 'drizzle-orm/postgres-js';
export { migrate } from 'drizzle-orm/postgres-js/migrator';
