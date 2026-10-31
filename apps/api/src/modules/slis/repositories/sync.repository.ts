import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from '@idmis/db';
import {
  db,
  device,
  assignment,
  changeLog,
  syncOp,
  syncConflict,
  syncQuarantine,
  farmer,
  plot,
  farm,
  plotAllocation,
  cropProduction,
  waterRequest,
  training,
  trainingAttendance,
  streamFlowReading,
  household,
  feeBilling,
  feeCollection,
} from '@idmis/db';
import { Injectable, Logger } from '@nestjs/common';
import type {
  RequestScope,
  ListSyncConflictsQuery,
  ListSyncQuarantineQuery,
  SyncPullChangeItem,
} from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export function stripSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...obj };
  delete stripped.numberEnc;
  delete stripped.numberHash;
  delete stripped.bankAccountEnc;
  return stripped;
}

export const SYNC_SUPPORTED_ENTITIES = new Set<string>([
  'farmer',
  'plot',
  'farm',
  'plot_allocation',
  'crop_production',
  'water_request',
  'training',
  'training_attendance',
  'stream_flow_reading',
  'household',
  'fee_billing',
  'fee_collection',
]);

@Injectable()
export class SyncRepository {
  private readonly logger = new Logger(SyncRepository.name);

  async findDevice(deviceId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(device).where(eq(device.id, deviceId)).limit(1);
    return row ?? null;
  }

  async updateDeviceScopeFingerprint(
    deviceId: string,
    scopeFingerprint: string,
    txDb: DatabaseOrTx = db,
  ) {
    const [row] = await txDb
      .update(device)
      .set({ scopeFingerprint })
      .where(eq(device.id, deviceId))
      .returning();
    return row ?? null;
  }

  async registerDevice(
    userId: string,
    data: {
      id?: string;
      installationId: string;
      label?: string;
      platform?: string;
      offlineGrantUntil?: string;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const id = data.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultGrant =
      data.offlineGrantUntil ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const [row] = await txDb
      .insert(device)
      .values({
        id,
        installationId: data.installationId,
        userId,
        label: data.label ?? null,
        platform: data.platform ?? null,
        registeredAt: now,
        lastSeenAt: now,
        offlineGrantUntil: defaultGrant,
      })
      .onConflictDoUpdate({
        target: [device.installationId, device.userId],
        set: {
          label: data.label ?? null,
          platform: data.platform ?? null,
          lastSeenAt: now,
          offlineGrantUntil: defaultGrant,
        },
      })
      .returning();

    return row!;
  }

  async findSyncOpById(opId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(syncOp).where(eq(syncOp.opId, opId)).limit(1);
    return row ?? null;
  }

  async claimSyncOp(
    opId: string,
    deviceId: string,
    entity: string,
    recordId: string,
    txDb: DatabaseOrTx = db,
  ) {
    return txDb
      .insert(syncOp)
      .values({
        opId,
        deviceId,
        entity,
        recordId,
        outcome: 'pending',
      })
      .onConflictDoNothing()
      .returning();
  }

  async updateSyncOpOutcome(
    opId: string,
    data: {
      outcome: 'applied' | 'rejected' | 'conflict' | 'quarantined';
      newVersion?: number;
      errors?: Array<{ status: number; detail: string }>;
    },
    txDb: DatabaseOrTx = db,
  ) {
    return txDb
      .update(syncOp)
      .set({
        outcome: data.outcome,
        newVersion: data.newVersion,
        errors: data.errors,
      })
      .where(eq(syncOp.opId, opId));
  }

  async findPrimaryAssignmentForDevice(deviceId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select({
        scopeOrgId: assignment.scopeOrgId,
        scopeStateId: assignment.scopeStateId,
      })
      .from(device)
      .innerJoin(assignment, eq(device.userId, assignment.userId))
      .where(and(eq(device.id, deviceId), isNull(assignment.deletedAt)))
      .orderBy(asc(assignment.createdAt))
      .limit(1);

    return row ?? null;
  }

  async recordConflict(
    data: {
      opId: string;
      entity: string;
      recordId: string;
      baseVersion: number;
      serverVersion: number;
      devicePayload: unknown;
      serverPayload: unknown;
      schemeId?: string | null;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const [row] = await txDb
      .insert(syncConflict)
      .values({
        id: crypto.randomUUID(),
        opId: data.opId,
        entity: data.entity,
        recordId: data.recordId,
        baseVersion: data.baseVersion,
        serverVersion: data.serverVersion,
        devicePayload: data.devicePayload as Record<string, unknown>,
        serverPayload: data.serverPayload as Record<string, unknown>,
        schemeId: data.schemeId ?? null,
        status: 'open',
      })
      .returning();

    return row!;
  }

  async recordQuarantine(
    data: {
      deviceId: string;
      opId: string;
      entity: string;
      action: string;
      recordId: string;
      baseVersion: number;
      payload: unknown;
      reason: string;
      schemeId?: string | null;
      stateId?: string | null;
    },
    txDb: DatabaseOrTx = db,
  ) {
    let schemeId = data.schemeId ?? null;
    let stateId = data.stateId ?? null;

    const payloadObj =
      data.payload && typeof data.payload === 'object'
        ? (data.payload as Record<string, unknown>)
        : {};

    if (!schemeId && typeof payloadObj.schemeId === 'string') {
      schemeId = payloadObj.schemeId;
    }
    if (!stateId && typeof payloadObj.stateId === 'string') {
      stateId = payloadObj.stateId;
    }

    if (!schemeId && !stateId) {
      const primary = await this.findPrimaryAssignmentForDevice(data.deviceId, txDb);
      if (primary) {
        schemeId = primary.scopeOrgId ?? null;
        stateId = primary.scopeStateId ?? null;
      }
    }

    const [row] = await txDb
      .insert(syncQuarantine)
      .values({
        id: crypto.randomUUID(),
        deviceId: data.deviceId,
        opId: data.opId,
        entity: data.entity,
        action: data.action,
        recordId: data.recordId,
        baseVersion: data.baseVersion,
        payload: payloadObj,
        reason: data.reason,
        schemeId,
        stateId,
      })
      .returning();

    return row!;
  }

  async fetchCurrentEntityRows(
    items: Array<{ entity: string; recordId: string }>,
    txDb: DatabaseOrTx = db,
  ): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (items.length === 0) return map;

    const groups = new Map<string, string[]>();
    for (const item of items) {
      const list = groups.get(item.entity) ?? [];
      list.push(item.recordId);
      groups.set(item.entity, list);
    }

    for (const [entity, ids] of groups) {
      if (ids.length === 0) continue;
      let rows: Array<Record<string, unknown>> = [];

      switch (entity) {
        case 'farmer':
          rows = (await txDb.select().from(farmer).where(inArray(farmer.id, ids))) as Array<
            Record<string, unknown>
          >;
          break;
        case 'plot':
          rows = (await txDb.select().from(plot).where(inArray(plot.id, ids))) as Array<
            Record<string, unknown>
          >;
          break;
        case 'farm':
          rows = (await txDb.select().from(farm).where(inArray(farm.id, ids))) as Array<
            Record<string, unknown>
          >;
          break;
        case 'plot_allocation':
          rows = (await txDb
            .select()
            .from(plotAllocation)
            .where(inArray(plotAllocation.id, ids))) as Array<Record<string, unknown>>;
          break;
        case 'crop_production':
          rows = (await txDb
            .select()
            .from(cropProduction)
            .where(inArray(cropProduction.id, ids))) as Array<Record<string, unknown>>;
          break;
        case 'water_request':
          rows = (await txDb
            .select()
            .from(waterRequest)
            .where(inArray(waterRequest.id, ids))) as Array<Record<string, unknown>>;
          break;
        case 'training':
          rows = (await txDb.select().from(training).where(inArray(training.id, ids))) as Array<
            Record<string, unknown>
          >;
          break;
        case 'training_attendance':
          rows = (await txDb
            .select()
            .from(trainingAttendance)
            .where(inArray(trainingAttendance.id, ids))) as Array<Record<string, unknown>>;
          break;
        case 'stream_flow_reading':
          rows = (await txDb
            .select()
            .from(streamFlowReading)
            .where(inArray(streamFlowReading.id, ids))) as Array<Record<string, unknown>>;
          break;
        case 'household':
          rows = (await txDb.select().from(household).where(inArray(household.id, ids))) as Array<
            Record<string, unknown>
          >;
          break;
        case 'fee_billing': {
          const res = (await txDb
            .select()
            .from(feeBilling)
            .where(inArray(feeBilling.id, ids))) as Array<Record<string, unknown>>;
          rows = res.map((r) => ({
            ...r,
            amountNgn:
              typeof r.amountNgn === 'number'
                ? Number(r.amountNgn).toFixed(2)
                : String(r.amountNgn),
          }));
          break;
        }
        case 'fee_collection': {
          const res = (await txDb
            .select()
            .from(feeCollection)
            .where(inArray(feeCollection.id, ids))) as Array<Record<string, unknown>>;
          rows = res.map((r) => ({
            ...r,
            amountNgn:
              typeof r.amountNgn === 'number'
                ? Number(r.amountNgn).toFixed(2)
                : String(r.amountNgn),
          }));
          break;
        }
        default:
          this.logger.error(`Unknown sync entity in fetchCurrentEntityRows: "${entity}"`);
          break;
      }

      for (const row of rows) {
        if (row && typeof row.id === 'string') {
          map.set(`${entity}:${row.id}`, row);
        }
      }
    }

    return map;
  }

  async fetchCurrentEntityRow(
    entity: string,
    recordId: string,
    txDb: DatabaseOrTx = db,
  ): Promise<Record<string, unknown> | null> {
    const map = await this.fetchCurrentEntityRows([{ entity, recordId }], txDb);
    return map.get(`${entity}:${recordId}`) ?? null;
  }

  async pullChanges(
    scope: RequestScope,
    cursor?: { xid: string; seq: number },
    limit: number = 500,
    txDb: DatabaseOrTx = db,
  ): Promise<{ items: SyncPullChangeItem[]; nextCursor: string | null; hasMore: boolean }> {
    // 1. Check for sync stall indicator: pg_snapshot_xmin lagging > 60s
    try {
      const xminCheck = await txDb.execute(sql`
        SELECT
          pg_snapshot_xmin(pg_current_snapshot()) as xmin,
          EXTRACT(EPOCH FROM (now() - backend_xmin_age.oldest_xact_start)) as lag_seconds
        FROM (
          SELECT min(xact_start) as oldest_xact_start
          FROM pg_stat_activity
          WHERE state = 'idle in transaction' OR state = 'active'
        ) backend_xmin_age
      `);
      const lag = Number(xminCheck[0]?.lag_seconds ?? 0);
      if (lag > 60) {
        this.logger.warn(`pg_snapshot_xmin lagging ${lag}s: long running transaction detected`);
      }
    } catch {
      // Non-fatal if stat view is restricted
    }

    // 2. Query change_log visible in snapshot
    // Filter rows with xid < pg_snapshot_xmin(pg_current_snapshot())
    // Ordered by (xid, seq)
    const conditions: SQL[] = [sql`${changeLog.xid} < pg_snapshot_xmin(pg_current_snapshot())`];

    const scopeCond = applyScope(scope, {
      scheme: changeLog.schemeId,
      state: changeLog.stateId,
    });
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    if (cursor) {
      conditions.push(
        sql`(${changeLog.xid}, ${changeLog.seq}) > (${cursor.xid}::xid8, ${cursor.seq}::bigint)`,
      );
    }

    const rows = await txDb
      .select({
        xid: changeLog.xid,
        seq: changeLog.seq,
        entity: changeLog.entity,
        recordId: changeLog.recordId,
        op: changeLog.op,
        schemeId: changeLog.schemeId,
        stateId: changeLog.stateId,
      })
      .from(changeLog)
      .where(and(...conditions))
      .orderBy(changeLog.xid, changeLog.seq)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Dynamically fetch current records for upsert operations
    const upsertItems = items.filter(
      (r) => r.op === 'upsert' && SYNC_SUPPORTED_ENTITIES.has(r.entity),
    );
    const entityRowMap = await this.fetchCurrentEntityRows(
      upsertItems.map((r) => ({ entity: r.entity, recordId: r.recordId })),
      txDb,
    );

    const mappedItems: SyncPullChangeItem[] = [];
    for (const r of items) {
      if (!SYNC_SUPPORTED_ENTITIES.has(r.entity)) {
        this.logger.error(
          `Unknown change_log entity "${r.entity}" for record "${r.recordId}" (op: ${r.op}); skipping item`,
        );
        continue;
      }

      if (r.op === 'delete') {
        mappedItems.push({
          xid: String(r.xid),
          seq: Number(r.seq),
          entity: r.entity,
          recordId: r.recordId,
          op: 'delete',
          deleted: true,
          schemeId: r.schemeId ?? null,
          stateId: r.stateId ?? null,
        });
        continue;
      }

      const currentRow = entityRowMap.get(`${r.entity}:${r.recordId}`);
      if (!currentRow || currentRow.deletedAt != null) {
        mappedItems.push({
          xid: String(r.xid),
          seq: Number(r.seq),
          entity: r.entity,
          recordId: r.recordId,
          op: 'delete',
          deleted: true,
          schemeId: r.schemeId ?? null,
          stateId: r.stateId ?? null,
        });
        continue;
      }

      mappedItems.push({
        xid: String(r.xid),
        seq: Number(r.seq),
        entity: r.entity,
        recordId: r.recordId,
        op: 'upsert',
        schemeId: r.schemeId ?? null,
        stateId: r.stateId ?? null,
        data: stripSensitiveData(currentRow),
      });
    }

    const last = items[items.length - 1];
    const nextCursor = last
      ? `${last.xid}:${last.seq}`
      : cursor
        ? `${cursor.xid}:${cursor.seq}`
        : null;

    return {
      items: mappedItems,
      nextCursor,
      hasMore,
    };
  }

  async listConflicts(
    scope: RequestScope,
    filters: Partial<ListSyncConflictsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCond = applyScope(scope, { scheme: syncConflict.schemeId });
    if (scopeCond) conditions.push(scopeCond);

    if (filters.schemeId) conditions.push(eq(syncConflict.schemeId, filters.schemeId));
    if (filters.entity) conditions.push(eq(syncConflict.entity, filters.entity));
    if (filters.status) conditions.push(eq(syncConflict.status, filters.status));

    const rows = await txDb
      .select()
      .from(syncConflict)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(syncConflict.id))
      .limit(limit);

    return rows;
  }

  async findConflictById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(syncConflict.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, { scheme: syncConflict.schemeId });
      if (scopeCond) conditions.push(scopeCond);
    }

    const [row] = await txDb
      .select()
      .from(syncConflict)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async resolveConflict(
    id: string,
    resolvedBy: string,
    status: 'resolved' = 'resolved',
    txDb: DatabaseOrTx = db,
  ) {
    const now = new Date().toISOString();
    const [row] = await txDb
      .update(syncConflict)
      .set({
        status,
        resolvedBy,
        resolvedAt: now,
      })
      .where(eq(syncConflict.id, id))
      .returning();

    return row ?? null;
  }

  async listQuarantines(
    scope: RequestScope,
    filters: Partial<ListSyncQuarantineQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCond = applyScope(scope, {
      scheme: syncQuarantine.schemeId,
      state: syncQuarantine.stateId,
    });
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    if (filters.deviceId) conditions.push(eq(syncQuarantine.deviceId, filters.deviceId));
    if (filters.reason) conditions.push(eq(syncQuarantine.reason, filters.reason));
    if (filters.status === 'pending') {
      conditions.push(sql`${syncQuarantine.resolution} IS NULL`);
    } else if (filters.status === 'resolved') {
      conditions.push(sql`${syncQuarantine.resolution} IS NOT NULL`);
    }

    const rows = await txDb
      .select()
      .from(syncQuarantine)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(syncQuarantine.quarantinedAt))
      .limit(limit);

    return rows;
  }

  async findQuarantineById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(syncQuarantine.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: syncQuarantine.schemeId,
        state: syncQuarantine.stateId,
      });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const [row] = await txDb
      .select()
      .from(syncQuarantine)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async resolveQuarantine(
    id: string,
    resolvedBy: string,
    resolution: 'applied' | 'discarded',
    auditLogId?: string,
    txDb: DatabaseOrTx = db,
  ) {
    const now = new Date().toISOString();
    const [row] = await txDb
      .update(syncQuarantine)
      .set({
        resolution,
        resolvedBy,
        resolvedAt: now,
        auditLogId: auditLogId ?? null,
      })
      .where(eq(syncQuarantine.id, id))
      .returning();

    return row ?? null;
  }
}
