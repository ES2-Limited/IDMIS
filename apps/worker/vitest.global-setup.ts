import { runMigrations } from '@idmis/db/migrate';
import { client } from '@idmis/db';

export async function setup() {
  await runMigrations();
  await client.end();
}
