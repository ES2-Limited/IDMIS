import { runMigrations, client } from '@idmis/db';

export async function setup() {
  await runMigrations();
  await client.end();
}
