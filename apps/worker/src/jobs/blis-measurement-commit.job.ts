import { db, importBatch, importRow, outboxEvent, auditLog, eq, and, sql } from '@idmis/db';
import { resolveUserAuthz } from '@idmis/db/authz';
import { permissions } from '@idmis/contracts';
import Redis from 'ioredis';
import crypto from 'node:crypto';

export interface MeasurementCommitJobData {
  batchId: string;
  userId: string;
}

export interface MeasurementCommitJobOptions {
  batchId: string;
  userId: string;
  dbClient?: typeof db;
  redisClient?: Redis;
}

export async function processMeasurementCommitJob(
  options: MeasurementCommitJobOptions,
): Promise<{ status: string; committedRows: number }> {
  const { batchId, userId } = options;
  const dbClient = options.dbClient ?? db;

  // 1. Re-resolve authz at run time
  const authz = await resolveUserAuthz(dbClient, userId);
  if (!authz.isActive || !authz.can(permissions.BLIS_MEASUREMENT_IMPORT)) {
    await dbClient
      .update(importBatch)
      .set({
        status: 'commit_failed',
        errorMessage: 'User lacks permission or is deactivated',
      })
      .where(eq(importBatch.id, batchId));
    return { status: 'commit_failed', committedRows: 0 };
  }

  // 2. Verify batch exists and is in committing status
  const [batch] = await dbClient
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, batchId))
    .limit(1);

  if (!batch || (batch.status !== 'committing' && batch.status !== 'validated')) {
    return {
      status: 'skipped',
      committedRows: batch?.committedRows ?? 0,
    };
  }

  // Ensure batch is marked committing
  if (batch.status !== 'committing') {
    await dbClient
      .update(importBatch)
      .set({ status: 'committing' })
      .where(eq(importBatch.id, batchId));
  }

  // 3. Find distinct years from valid rows and ensure partitions exist
  const yearRows = await dbClient.execute<{ yr: number }>(sql`
    SELECT DISTINCT EXTRACT(YEAR FROM (parsed_data->>'observedAt')::timestamptz)::int AS yr
    FROM core.import_row
    WHERE batch_id = ${batchId}::uuid AND status = 'valid';
  `);

  for (const yrRow of yearRows) {
    if (yrRow.yr && !isNaN(yrRow.yr)) {
      await dbClient.execute(sql`SELECT blis.ensure_measurement_partition(${yrRow.yr});`);
    }
  }

  // 4. Chunk valid rows in chunks of 5,000
  const CHUNK_SIZE = 5000;
  let lastRowNumber = 0;
  let totalCommitted = 0;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redis: Redis | null = options.redisClient ?? null;
  if (!redis && process.env.REDIS_URL) {
    try {
      redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect().catch(() => {});
    } catch {
      redis = null;
    }
  }

  const publishProgress = async (pct: number, message: string) => {
    if (!redis) return;
    try {
      await redis.publish(
        `import:progress:${batchId}`,
        JSON.stringify({
          type: 'progress',
          batchId,
          dataset: 'blis.measurement',
          status: 'committing',
          percentage: pct,
          message,
          committedRows: totalCommitted,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore redis errors
    }
  };

  while (true) {
    const rows = await dbClient
      .select({
        id: importRow.id,
        rowNumber: importRow.rowNumber,
        parsedData: importRow.parsedData,
      })
      .from(importRow)
      .where(
        and(
          eq(importRow.batchId, batchId),
          eq(importRow.status, 'valid'),
          sql`${importRow.rowNumber} > ${lastRowNumber}`,
        ),
      )
      .orderBy(importRow.rowNumber)
      .limit(CHUNK_SIZE);

    if (rows.length === 0) {
      break;
    }

    const startRowNumber = rows[0]!.rowNumber;
    const endRowNumber = rows[rows.length - 1]!.rowNumber;
    lastRowNumber = endRowNumber;

    const chunkItems = rows.map((r) => {
      const d = r.parsedData as Record<string, unknown>;
      return {
        id: crypto.randomUUID(),
        stationId: d.stationId as string,
        parameterId: d.parameterId as string,
        observedAt: d.observedAt as string,
        value: d.value as string,
        unit: d.unit as string,
        quality: (d.quality as string) ?? 'raw',
      };
    });

    const jsonbData = JSON.stringify(chunkItems);

    // One transaction per chunk
    await dbClient.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO blis.measurement (
          id, station_id, parameter_id, observed_at, value, unit, quality, source, import_batch_id, created_by
        )
        SELECT
          (v->>'id')::uuid,
          (v->>'stationId')::uuid,
          (v->>'parameterId')::uuid,
          (v->>'observedAt')::timestamptz,
          (v->>'value')::numeric,
          v->>'unit',
          COALESCE(v->>'quality', 'raw'),
          'import',
          ${batchId}::uuid,
          ${userId}::uuid
        FROM jsonb_array_elements(${jsonbData}::jsonb) AS v
        ON CONFLICT (station_id, parameter_id, observed_at) DO UPDATE SET
          value = EXCLUDED.value,
          unit = EXCLUDED.unit,
          quality = EXCLUDED.quality,
          source = 'import',
          import_batch_id = EXCLUDED.import_batch_id;
      `);

      await tx.execute(sql`
        UPDATE core.import_row
        SET status = 'committed'
        WHERE batch_id = ${batchId}::uuid
          AND row_number >= ${startRowNumber}
          AND row_number <= ${endRowNumber}
          AND status = 'valid';
      `);

      totalCommitted += rows.length;

      await tx
        .update(importBatch)
        .set({ committedRows: totalCommitted })
        .where(eq(importBatch.id, batchId));
    });

    const pct =
      batch.validRows && batch.validRows > 0
        ? Math.min(99, Math.round((totalCommitted / batch.validRows) * 100))
        : 50;
    await publishProgress(pct, `Committed ${totalCommitted} rows...`);
  }

  // 5. Query distinct stations and time range for outbox event
  const [stats] = await dbClient.execute<{
    station_ids: string[];
    min_observed_at: string;
    max_observed_at: string;
  }>(sql`
    SELECT
      array_agg(DISTINCT (parsed_data->>'stationId')::uuid) AS station_ids,
      min((parsed_data->>'observedAt')::timestamptz)::text AS min_observed_at,
      max((parsed_data->>'observedAt')::timestamptz)::text AS max_observed_at
    FROM core.import_row
    WHERE batch_id = ${batchId}::uuid AND status = 'committed';
  `);

  const stationIds = stats?.station_ids ?? [];
  const minObservedAt = stats?.min_observed_at ?? new Date().toISOString();
  const maxObservedAt = stats?.max_observed_at ?? new Date().toISOString();

  // 6. Finalize in transaction: outbox event + audit log + import batch status
  await dbClient.transaction(async (tx) => {
    await tx.insert(outboxEvent).values({
      eventType: 'blis.measurement.loaded',
      eventVersion: 1,
      aggregateType: 'import_batch',
      aggregateId: batchId,
      payload: {
        batchId,
        stationIds,
        timeRange: {
          from: minObservedAt,
          to: maxObservedAt,
        },
        rowCount: totalCommitted,
      },
    });

    await tx.insert(auditLog).values({
      actorType: 'user',
      actorUserId: userId,
      action: 'import',
      entityType: 'core.import_batch',
      entityId: batchId,
      changes: {
        after: {
          dataset: 'blis.measurement',
          committedRows: totalCommitted,
        },
      },
    });

    await tx
      .update(importBatch)
      .set({
        status: 'committed',
        committedRows: totalCommitted,
        committedAt: new Date().toISOString(),
      })
      .where(eq(importBatch.id, batchId));
  });

  // 7. Refresh blis.mv_latest_reading
  await dbClient.execute(sql`SELECT blis.refresh_mv_latest_reading();`);

  await publishProgress(100, `Successfully committed ${totalCommitted} readings.`);

  if (redis && redis !== options.redisClient) {
    await redis.quit().catch(() => {});
  }

  return {
    status: 'committed',
    committedRows: totalCommitted,
  };
}
