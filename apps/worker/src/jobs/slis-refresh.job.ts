import { db, sql } from '@idmis/db';

export async function refreshMaterializedViewsJob(options: { dbClient?: typeof db } = {}) {
  const dbClient = options.dbClient ?? db;
  console.log('[RefreshMvJob] Starting refresh of SLIS materialized views...');
  await dbClient.execute(sql`SELECT slis.refresh_report_views();`);
  console.log('[RefreshMvJob] SLIS materialized views refreshed successfully.');
  return { status: 'success', refreshedAt: new Date().toISOString() };
}
