import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  db,
  auditLog,
  syncOp,
  syncConflict,
  importBatch,
  file,
  outboxEvent,
  farmer,
  farmerIdentity,
  farm,
  plot,
  setting,
  eq,
  and,
  sql,
  inArray,
  SYSTEM_USER_ID,
} from '@idmis/db';
import { getWorkerS3Config } from '../config/storage';
import { runAuditArchiveJob } from './audit-archive.job';

export interface RetentionPurgeOptions {
  dryRun?: boolean;
  triggeredBy?: string;
  s3Client?: S3Client;
  bucket?: string;
  now?: Date;
}

export interface RetentionPurgeCounts {
  auditLog: number;
  syncQueue: number;
  importBatches: number;
  outboxEvents: number;
  farmers: number;
  farms: number;
  plots: number;
}

export interface RetentionPurgeResult {
  dryRun: boolean;
  counts: RetentionPurgeCounts;
  executedAt: string;
}

/**
 * Worker Retention Purge Job (BE-5.3):
 * - Implements data retention matrix across system tables:
 *   - Audit log: keep forever by default; if setting audit_retention_months set, export to gzip in R2/S3 (sha256 verified) then hard delete rows older than that.
 *   - Sync queue: completed/failed rows > 30 days hard deleted.
 *   - Import batches: completed/failed batches older than 90 days: uploaded raw file deleted from storage, import_batch rows marked archived (audit kept).
 *   - Outbox events: published events > 14 days hard deleted.
 *   - Soft-deleted entities: farmer/farm/plot deleted > 365 days -> purge associated personal identity records (NIN/BVN hashes/encrypted columns set to NULL; keep demographic row with anonymised=true).
 * - Audited: writes an audit_log row with counts per table.
 * - Dry-run mode: accepts { dryRun: true } -> counts rows without deleting, audits dry run.
 */
export async function runRetentionPurgeJob(
  options: RetentionPurgeOptions = {},
): Promise<RetentionPurgeResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();

  let s3Client = options.s3Client;
  let bucket = options.bucket;

  if (!s3Client || !bucket) {
    try {
      const config = getWorkerS3Config();
      s3Client = s3Client ?? config.s3Client;
      bucket = bucket ?? config.bucket;
    } catch {
      // In tests or mock environments where S3 is not configured
    }
  }

  // 1. Audit Log retention
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

  let auditLogCount = 0;
  if (retentionMonths !== null && !isNaN(retentionMonths) && retentionMonths > 0) {
    const auditCutoff = new Date(now.getTime() - retentionMonths * 30 * 24 * 60 * 60 * 1000);
    const [matchingAudit] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(sql`"timestamp" < ${auditCutoff.toISOString()}`);
    auditLogCount = matchingAudit?.count ?? 0;

    if (!dryRun && auditLogCount > 0) {
      await runAuditArchiveJob({
        migrationDatabaseUrl: process.env.DATABASE_URL,
        s3Client,
        bucket,
      });
    }
  }

  // 2. Sync Queue (core.sync_op): completed/failed rows > 30 days hard deleted
  const syncCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const matchingSyncOps = await db
    .select({ opId: syncOp.opId })
    .from(syncOp)
    .where(
      and(
        inArray(syncOp.outcome, ['applied', 'rejected']),
        sql`"received_at" < ${syncCutoff.toISOString()}`,
      ),
    );
  const syncQueueCount = matchingSyncOps.length;

  if (!dryRun && syncQueueCount > 0) {
    const opIds = matchingSyncOps.map((o) => o.opId);
    await db.delete(syncConflict).where(inArray(syncConflict.opId, opIds));
    await db.delete(syncOp).where(inArray(syncOp.opId, opIds));
  }

  // 3. Import Batches (core.import_batch): completed/failed batches older than 90 days
  const importCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const matchingBatches = await db
    .select({
      id: importBatch.id,
      fileId: importBatch.fileId,
      fileKey: file.storageKey,
    })
    .from(importBatch)
    .leftJoin(file, eq(importBatch.fileId, file.id))
    .where(
      and(
        inArray(importBatch.status, [
          'committed',
          'undone',
          'validation_failed',
          'commit_failed',
          'undo_failed',
        ]),
        sql`"core"."import_batch"."created_at" < ${importCutoff.toISOString()}`,
      ),
    );
  const importBatchesCount = matchingBatches.length;

  if (!dryRun && importBatchesCount > 0) {
    for (const batch of matchingBatches) {
      if (batch.fileKey && s3Client && bucket) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: batch.fileKey,
            }),
          );
        } catch (err: unknown) {
          console.warn(`[RetentionPurge] Failed to delete S3 file ${batch.fileKey}:`, err);
        }
      }
      await db
        .update(importBatch)
        .set({
          status: 'archived',
          updatedAt: now.toISOString(),
        })
        .where(eq(importBatch.id, batch.id));
    }
  }

  // 4. Outbox Events (core.outbox_event): published events > 14 days hard deleted
  const outboxCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const matchingEvents = await db
    .select({ id: outboxEvent.id })
    .from(outboxEvent)
    .where(
      and(sql`"delivered_at" IS NOT NULL`, sql`"delivered_at" < ${outboxCutoff.toISOString()}`),
    );
  const outboxEventsCount = matchingEvents.length;

  if (!dryRun && outboxEventsCount > 0) {
    const eventIds = matchingEvents.map((e) => e.id);
    await db.delete(outboxEvent).where(inArray(outboxEvent.id, eventIds));
  }

  // 5. Soft-deleted entities: farmer/farm/plot deleted > 365 days -> purge personal identity records
  const softDeleteCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Farmers
  const matchingFarmers = await db
    .select({ id: farmer.id })
    .from(farmer)
    .where(
      and(
        sql`"deleted_at" IS NOT NULL`,
        sql`"deleted_at" < ${softDeleteCutoff.toISOString()}`,
        sql`("anonymised" = false OR "anonymised" IS NULL)`,
      ),
    );
  const farmersCount = matchingFarmers.length;

  if (!dryRun && farmersCount > 0) {
    const farmerIds = matchingFarmers.map((f) => f.id);
    // Purge NIN/BVN hashes and encrypted columns
    await db
      .update(farmerIdentity)
      .set({
        numberEnc: null,
        numberHash: null,
        numberLast4: null,
        bankName: null,
        documentFileId: null,
        updatedAt: now.toISOString(),
      })
      .where(inArray(farmerIdentity.farmerId, farmerIds));

    // Anonymise farmer record, retaining demographic fields for statistics
    await db
      .update(farmer)
      .set({
        anonymised: true,
        phone: null,
        firstName: 'ANONYMISED',
        lastName: 'FARMER',
        otherNames: null,
        nextOfKinName: null,
        nextOfKinPhone: null,
        nextOfKinRelation: null,
        photoFileId: null,
        updatedAt: now.toISOString(),
      })
      .where(inArray(farmer.id, farmerIds));
  }

  // Farms
  const matchingFarms = await db
    .select({ id: farm.id })
    .from(farm)
    .where(
      and(
        sql`"deleted_at" IS NOT NULL`,
        sql`"deleted_at" < ${softDeleteCutoff.toISOString()}`,
        sql`("anonymised" = false OR "anonymised" IS NULL)`,
      ),
    );
  const farmsCount = matchingFarms.length;

  if (!dryRun && farmsCount > 0) {
    const farmIds = matchingFarms.map((f) => f.id);
    await db
      .update(farm)
      .set({
        anonymised: true,
        updatedAt: now.toISOString(),
      })
      .where(inArray(farm.id, farmIds));
  }

  // Plots
  const matchingPlots = await db
    .select({ id: plot.id })
    .from(plot)
    .where(
      and(
        sql`"deleted_at" IS NOT NULL`,
        sql`"deleted_at" < ${softDeleteCutoff.toISOString()}`,
        sql`("anonymised" = false OR "anonymised" IS NULL)`,
      ),
    );
  const plotsCount = matchingPlots.length;

  if (!dryRun && plotsCount > 0) {
    const plotIds = matchingPlots.map((p) => p.id);
    await db
      .update(plot)
      .set({
        anonymised: true,
        updatedAt: now.toISOString(),
      })
      .where(inArray(plot.id, plotIds));
  }

  const counts: RetentionPurgeCounts = {
    auditLog: auditLogCount,
    syncQueue: syncQueueCount,
    importBatches: importBatchesCount,
    outboxEvents: outboxEventsCount,
    farmers: farmersCount,
    farms: farmsCount,
    plots: plotsCount,
  };

  // Write audit log entry
  await db.insert(auditLog).values({
    actorType: 'worker',
    actorUserId: options.triggeredBy || SYSTEM_USER_ID,
    action: dryRun ? 'retention.dry_run' : 'retention.purge',
    entityType: 'system',
    entityId: SYSTEM_USER_ID,
    changes: {
      after: {
        dryRun,
        counts,
        executedAt: now.toISOString(),
      },
    },
    occurredAt: now.toISOString(),
  });

  return {
    dryRun,
    counts,
    executedAt: now.toISOString(),
  };
}

export async function processRetentionPurgeJob(
  data: RetentionPurgeOptions = {},
): Promise<RetentionPurgeResult> {
  return runRetentionPurgeJob(data);
}
