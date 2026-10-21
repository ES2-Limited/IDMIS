import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
export const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export * from './constants';
export * from './schema/index';
