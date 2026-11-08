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
  now?: Date;
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

async function getObjectBuffer(
  s3Client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  try {
    const resp = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    if (!resp.Body) return null;
    const stream = resp.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Step 1: ARCHIVE
 * Exports an entire year's audit rows from core.audit_log to S3 as gzipped NDJSON + sha256 checksum,
 * and verifies the upload's row count and checksum.
 */
async function archiveAuditYear(
  year: number,
  ownerSql: ReturnType<typeof postgres>,
  s3Client: S3Client,
  bucket: string,
): Promise<{ rowCount: number; storageKey?: string; sha256?: string }> {
  const startIso = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString();

  console.log(
    `[AuditArchive] Querying audit_log rows for year ${year} (${startIso} to ${endIso})...`,
  );

  const rows = await ownerSql<Record<string, unknown>[]>`
    SELECT * FROM "core"."audit_log"
    WHERE "occurred_at" >= ${startIso}::timestamptz AND "occurred_at" < ${endIso}::timestamptz
    ORDER BY "occurred_at" ASC;
  `;

  if (rows.length === 0) {
    console.log(`[AuditArchive] No audit records found for year ${year}.`);
    return { rowCount: 0 };
  }

  // 1. Serialize to NDJSON and compress with gzip
  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
  const gzipped = zlib.gzipSync(Buffer.from(ndjson, 'utf-8'));
  const sha256 = crypto.createHash('sha256').update(gzipped).digest('hex');
  const storageKey = `audit-archives/${year}.json.gz`;
  const checksumKey = `audit-archives/${year}.json.gz.sha256`;
  const checksumKeyAlt = `audit-archives/${year}.sha256`;

  // 2. Upload gzipped archive
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: gzipped,
      ContentType: 'application/gzip',
      Metadata: {
        'row-count': String(rows.length),
        sha256: sha256,
        'target-year': String(year),
      },
    }),
  );

  // 3. Upload checksum file
  const checksumContent = `${sha256}\n`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: checksumKey,
      Body: Buffer.from(checksumContent, 'utf-8'),
      ContentType: 'text/plain',
    }),
  );
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: checksumKeyAlt,
      Body: Buffer.from(checksumContent, 'utf-8'),
      ContentType: 'text/plain',
    }),
  );

  // 4. Verify uploaded archive
  const verifyBuf = await getObjectBuffer(s3Client, bucket, storageKey);
  if (!verifyBuf) {
    throw new Error(`Failed to retrieve uploaded audit archive ${storageKey} from storage.`);
  }

  const downloadedSha256 = crypto.createHash('sha256').update(verifyBuf).digest('hex');
  if (downloadedSha256 !== sha256) {
    throw new Error(
      `Checksum mismatch for audit archive ${storageKey}: expected ${sha256}, got ${downloadedSha256}`,
    );
  }

  const decompressed = zlib.gunzipSync(verifyBuf).toString('utf-8');
  const decompressedRowCount = decompressed.split('\n').filter(Boolean).length;
  if (decompressedRowCount !== rows.length) {
    throw new Error(
      `Row count mismatch for audit archive ${storageKey}: expected ${rows.length}, got ${decompressedRowCount}`,
    );
  }

  // Verify checksum file
  const checksumBuf = await getObjectBuffer(s3Client, bucket, checksumKey);
  if (!checksumBuf || !checksumBuf.toString('utf-8').includes(sha256)) {
    throw new Error(`Checksum file verification failed for ${checksumKey}`);
  }

  // 5. Audit the archive run in core.audit_log
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
      ${String(year)},
      ${JSON.stringify({
        after: {
          targetYear: year,
          rowCount: rows.length,
          storageKey,
          sha256,
        },
      })}::jsonb,
      ${nowIso}::timestamptz
    );
  `;

  return {
    rowCount: rows.length,
    storageKey,
    sha256,
  };
}

interface VerifiedArchiveInfo {
  isVerified: boolean;
  rowIds: Set<string>;
}

async function verifyArchive(
  year: number,
  s3Client: S3Client,
  bucket: string,
): Promise<VerifiedArchiveInfo> {
  const storageKey = `audit-archives/${year}.json.gz`;
  const checksumKey = `audit-archives/${year}.json.gz.sha256`;
  const checksumKeyAlt = `audit-archives/${year}.sha256`;

  const archiveBuf = await getObjectBuffer(s3Client, bucket, storageKey);
  if (!archiveBuf) {
    return { isVerified: false, rowIds: new Set() };
  }

  const actualSha256 = crypto.createHash('sha256').update(archiveBuf).digest('hex');

  let checksumBuf = await getObjectBuffer(s3Client, bucket, checksumKey);
  if (!checksumBuf) {
    checksumBuf = await getObjectBuffer(s3Client, bucket, checksumKeyAlt);
  }

  if (checksumBuf) {
    const expectedSha256 = checksumBuf.toString('utf-8').trim().split(/\s+/)[0];
    if (expectedSha256 !== actualSha256) {
      console.warn(`[AuditArchive] Checksum mismatch for ${storageKey}`);
      return { isVerified: false, rowIds: new Set() };
    }
  }

  try {
    const decompressed = zlib.gunzipSync(archiveBuf).toString('utf-8');
    const lines = decompressed.split('\n').filter(Boolean);
    const rowIds = new Set<string>();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { id?: string };
        if (parsed && typeof parsed.id === 'string') {
          rowIds.add(parsed.id);
        }
      } catch {
        return { isVerified: false, rowIds: new Set() };
      }
    }
    return { isVerified: true, rowIds };
  } catch {
    return { isVerified: false, rowIds: new Set() };
  }
}

/**
 * Step 2: PURGE
 * Deletes rows with occurred_at < (now - retention months) that are inside a VERIFIED archive.
 */
async function purgeAuditLogs(
  retentionMonths: number,
  cutoffIso: string,
  ownerSql: ReturnType<typeof postgres>,
  s3Client: S3Client,
  bucket: string,
): Promise<number> {
  const candidateYears = await ownerSql<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "occurred_at")::int AS year
    FROM "core"."audit_log"
    WHERE "occurred_at" < ${cutoffIso}::timestamptz
    ORDER BY year ASC;
  `;

  if (candidateYears.length === 0) {
    return 0;
  }

  let totalPurged = 0;

  for (const { year } of candidateYears) {
    const { isVerified, rowIds } = await verifyArchive(year, s3Client, bucket);
    if (!isVerified || rowIds.size === 0) {
      console.log(
        `[AuditArchive] Archive for year ${year} is not verified or missing in storage. Purge skipped for year ${year}.`,
      );
      continue;
    }

    const idList = Array.from(rowIds);
    const deleted = await ownerSql<{ id: string }[]>`
      DELETE FROM "core"."audit_log"
      WHERE "occurred_at" < ${cutoffIso}::timestamptz
        AND "id" = ANY(${idList})
      RETURNING "id";
    `;

    if (deleted.length > 0) {
      totalPurged += deleted.length;
      console.log(
        `[AuditArchive] Purged ${deleted.length} verified archived rows for year ${year}.`,
      );

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
          'audit.purged',
          'core.audit_log',
          ${String(year)},
          ${JSON.stringify({
            after: {
              year,
              retentionMonths,
              cutoff: cutoffIso,
              purgedCount: deleted.length,
            },
          })}::jsonb,
          ${nowIso}::timestamptz
        );
      `;
    }
  }

  return totalPurged;
}

/**
 * Audit Archival Job (BE-5.4):
 * - Split into two distinct steps: ARCHIVE and PURGE.
 * - Explicit targetYear run ARCHIVES ONLY (never deletes).
 * - PURGE runs only when core.setting 'audit_retention_months' is a positive number,
 *   and deletes only rows with occurred_at < (now - retention months) that are inside a VERIFIED archive.
 * - Setting unset -> archive only, never delete anything.
 */
export async function runAuditArchiveJob(
  options: AuditArchiveOptions = {},
): Promise<AuditArchiveResult> {
  const now = options.now ?? new Date();
  const currentYear = now.getFullYear();

  // 1. Fetch retention setting
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

  const hasRetentionPolicy =
    retentionMonths !== null && !isNaN(retentionMonths) && retentionMonths > 0;

  // 2. If automatic run (targetYear is undefined) and setting unset -> skip immediately, 0 rows deleted
  if (options.targetYear === undefined && !hasRetentionPolicy) {
    console.log(
      "[AuditArchive] Setting 'audit_retention_months' is not configured (null); retention policy is keep forever. Purge skipped.",
    );
    return {
      status: 'skipped',
      retentionMonths: null,
      purgedCount: 0,
      reason: 'No retention period configured (keep forever)',
    };
  }

  // 3. Setup database connection with owner privileges
  const migrationUrl =
    options.migrationDatabaseUrl || process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

  if (!migrationUrl) {
    console.warn('[AuditArchive] Database URL absent. Run aborted.');
    return {
      status: 'skipped',
      reason: 'Database URL required',
    };
  }

  const ownerSql = postgres(migrationUrl);

  // 4. Resolve S3 client and bucket
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

  try {
    // Mode A: Explicit targetYear run -> ARCHIVES ONLY, never deletes
    if (options.targetYear !== undefined) {
      const archiveRes = await archiveAuditYear(options.targetYear, ownerSql, s3Client, bucket);
      return {
        status: 'archived',
        targetYear: options.targetYear,
        rowCount: archiveRes.rowCount,
        purgedCount: 0,
        storageKey: archiveRes.storageKey,
        sha256: archiveRes.sha256,
      };
    }

    // Mode B: Automatic run with positive audit_retention_months
    // Step 1: Archive previous calendar year (currentYear - 1)
    const previousYear = currentYear - 1;
    const archiveRes = await archiveAuditYear(previousYear, ownerSql, s3Client, bucket);

    // Step 2: Purge rows older than retentionMonths that are in a verified archive
    const cutoffDate = new Date(now.getTime());
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths!);
    const cutoffIso = cutoffDate.toISOString();

    const purgedCount = await purgeAuditLogs(
      retentionMonths!,
      cutoffIso,
      ownerSql,
      s3Client,
      bucket,
    );

    return {
      status: 'purged',
      targetYear: previousYear,
      retentionMonths,
      rowCount: archiveRes.rowCount,
      purgedCount,
      storageKey: archiveRes.storageKey,
      sha256: archiveRes.sha256,
    };
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
}
