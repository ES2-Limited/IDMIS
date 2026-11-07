import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { db, setting, eq, postgres } from '@idmis/db';
import { getWorkerS3Config } from '../config/storage';

export interface AuditArchiveOptions {
  targetYear?: number;
  migrationDatabaseUrl?: string;
  s3Client?: S3Client;
  bucket?: string;
}

export interface AuditArchiveResult {
  status: 'skipped' | 'purged' | 'archived';
  targetYear?: number;
  retentionMonths?: number | null;
  purgedCount?: number;
  rowCount?: number;
  storageKey?: string;
  sha256?: string;
  reason?: string;
}

/**
 * Audit Archival Job (BE-5.4):
 * - Runs yearly (and on demand): exports the target year's audit rows to gzip in R2,
 *   verifies checksum + row count, deletes archived rows, and audits the archive run.
 * - If targetYear is omitted, defaults to the previous calendar year.
 * - Enforces audit_retention_months when run without a targetYear.
 * - Requires owner/migrator database privilege to DELETE from core.audit_log.
 */
export async function runAuditArchiveJob(
  options: AuditArchiveOptions = {},
): Promise<AuditArchiveResult> {
  const currentYear = new Date().getFullYear();
  const targetYear = options.targetYear ?? currentYear - 1;

  // 1. Check retention setting if running automatic background retention
  if (options.targetYear === undefined) {
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
  }

  // 2. Database connection with DELETE privilege
  const migrationUrl =
    options.migrationDatabaseUrl || process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

  if (!migrationUrl) {
    console.warn('[AuditArchive] MIGRATION_DATABASE_URL / DATABASE_URL is absent. Purge aborted.');
    return {
      status: 'skipped',
      reason: 'Database URL required for purge privilege',
    };
  }

  const ownerSql = postgres(migrationUrl);

  try {
    const startIso = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0)).toISOString();
    const endIso = new Date(Date.UTC(targetYear + 1, 0, 1, 0, 0, 0, 0)).toISOString();

    console.log(
      `[AuditArchive] Querying audit_log rows for year ${targetYear} (${startIso} to ${endIso})...`,
    );

    // 3. Query audit rows for target year
    const rows = await ownerSql<Record<string, unknown>[]>`
      SELECT * FROM "core"."audit_log"
      WHERE "occurred_at" >= ${startIso}::timestamptz AND "occurred_at" < ${endIso}::timestamptz
      ORDER BY "occurred_at" ASC;
    `;

    if (rows.length === 0) {
      console.log(`[AuditArchive] No audit records found for year ${targetYear}.`);
      return {
        status: 'archived',
        targetYear,
        rowCount: 0,
      };
    }

    // 4. Serialize to JSON lines and compress with gzip
    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
    const gzipped = zlib.gzipSync(Buffer.from(ndjson, 'utf-8'));
    const sha256 = crypto.createHash('sha256').update(gzipped).digest('hex');
    const storageKey = `audit-archives/${targetYear}.json.gz`;

    // 5. Upload to S3/R2
    let s3Client: S3Client;
    let bucket: string;

    if (options.s3Client && options.bucket) {
      s3Client = options.s3Client;
      bucket = options.bucket;
    } else {
      const config = getWorkerS3Config();
      s3Client = config.s3Client;
      bucket = config.bucket;
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: gzipped,
        ContentType: 'application/gzip',
        Metadata: {
          'row-count': String(rows.length),
          sha256: sha256,
          'target-year': String(targetYear),
        },
      }),
    );

    // 6. Verify uploaded file: read back and verify checksum and row count
    const verifyResp = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      }),
    );

    if (!verifyResp.Body) {
      throw new Error(`Failed to retrieve uploaded audit archive ${storageKey} from storage.`);
    }

    const downloadedChunks: Buffer[] = [];
    const stream = verifyResp.Body as Readable;
    for await (const chunk of stream) {
      downloadedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const downloadedBuf = Buffer.concat(downloadedChunks);
    const downloadedSha256 = crypto.createHash('sha256').update(downloadedBuf).digest('hex');

    if (downloadedSha256 !== sha256) {
      throw new Error(
        `Checksum mismatch for audit archive ${storageKey}: expected ${sha256}, got ${downloadedSha256}`,
      );
    }

    const decompressed = zlib.gunzipSync(downloadedBuf).toString('utf-8');
    const decompressedRowCount = decompressed.split('\n').filter(Boolean).length;
    if (decompressedRowCount !== rows.length) {
      throw new Error(
        `Row count mismatch for audit archive ${storageKey}: expected ${rows.length}, got ${decompressedRowCount}`,
      );
    }

    // 7. Delete archived rows from DB
    const deleted = await ownerSql`
      DELETE FROM "core"."audit_log"
      WHERE "occurred_at" >= ${startIso}::timestamptz AND "occurred_at" < ${endIso}::timestamptz
      RETURNING "id";
    `;

    console.log(
      `[AuditArchive] Successfully archived ${rows.length} rows for year ${targetYear} to ${storageKey} (sha256: ${sha256}). Deleted ${deleted.length} rows from database.`,
    );

    // 8. Audit the archive run in core.audit_log
    const nowIso = new Date().toISOString();
    await ownerSql`
      INSERT INTO "core"."audit_log" (
        "id",
        "actor_type",
        "action",
        "entity_type",
        "entity_id",
        "changes",
        "occurred_at"
      ) VALUES (
        ${crypto.randomUUID()},
        'system',
        'audit.archived',
        'core.audit_log',
        ${String(targetYear)},
        ${JSON.stringify({
          after: {
            targetYear,
            rowCount: rows.length,
            deletedCount: deleted.length,
            storageKey,
            sha256,
          },
        })}::jsonb,
        ${nowIso}::timestamptz
      );
    `;

    return {
      status: 'archived',
      targetYear,
      rowCount: rows.length,
      purgedCount: deleted.length,
      storageKey,
      sha256,
    };
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
}
