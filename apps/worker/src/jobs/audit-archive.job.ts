import { db, setting, eq, postgres } from '@idmis/db';

export interface AuditArchiveResult {
  status: 'skipped' | 'purged';
  retentionMonths: number | null;
  purgedCount?: number;
  reason?: string;
}

/**
 * Audit Archival Job:
 * - Checks 'audit_retention_months' in core.setting.
 * - If null or not configured, NO purge is performed (retention = keep forever).
 * - If configured, purge MUST be executed using the owner/migrator role (idmis_app lacks DELETE on audit_log).
 */
export async function runAuditArchiveJob(): Promise<AuditArchiveResult> {
  // 1. Check retention setting
  const [retentionSetting] = await db
    .select()
    .from(setting)
    .where(eq(setting.key, 'audit_retention_months'));

  const retentionMonths =
    retentionSetting?.value &&
    typeof retentionSetting.value === 'object' &&
    'months' in retentionSetting.value
      ? Number(retentionSetting.value.months)
      : typeof retentionSetting?.value === 'number'
        ? retentionSetting.value
        : null;

  if (retentionMonths === null || isNaN(retentionMonths) || retentionMonths <= 0) {
    console.log(
      "[AuditArchive] Setting 'audit_retention_months' is not configured (null); retention policy is keep forever. Purge skipped.",
    );
    return {
      status: 'skipped',
      retentionMonths: null,
      reason: 'No retention period configured (keep forever)',
    };
  }

  // 2. Retention is configured: Purge requires owner / migration role
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationUrl) {
    console.warn(
      '[AuditArchive] MIGRATION_DATABASE_URL is absent. Purge of core.audit_log cannot run as idmis_app (insert-only). Purge aborted.',
    );
    return {
      status: 'skipped',
      retentionMonths,
      reason: 'MIGRATION_DATABASE_URL required for purge privilege',
    };
  }

  const ownerSql = postgres(migrationUrl);
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    const cutoffIso = cutoffDate.toISOString();

    console.log(
      `[AuditArchive] Purging audit_log records older than ${retentionMonths} months (cutoff: ${cutoffIso}) using owner connection...`,
    );

    const deletedRows = await ownerSql`
      DELETE FROM "core"."audit_log"
      WHERE "occurred_at" < ${cutoffIso}::timestamptz
      RETURNING "id";
    `;

    console.log(`[AuditArchive] Purged ${deletedRows.length} archived audit_log rows.`);
    return {
      status: 'purged',
      retentionMonths,
      purgedCount: deletedRows.length,
    };
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
}
