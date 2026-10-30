import { and, desc, eq, inArray, sql, type SQL } from '@idmis/db';
import { db, device, changeLog, syncOp, syncConflict, syncQuarantine } from '@idmis/db';
import { Injectable, Logger } from '@nestjs/common';
import type {
  RequestScope,
  ListSyncConflictsQuery,
  ListSyncQuarantineQuery,
  SyncPullChangeItem,
} from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

@Injectable()
export class SyncRepository {
  private readonly logger = new Logger(SyncRepository.name);

  async findDevice(deviceId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(device).where(eq(device.id, deviceId)).limit(1);
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

  async findExistingSyncOps(opIds: string[], txDb: DatabaseOrTx = db) {
    if (opIds.length === 0) return [];
    return txDb.select().from(syncOp).where(inArray(syncOp.opId, opIds));
  }

  async recordSyncOp(
    data: {
      opId: string;
      deviceId: string;
      entity: string;
      recordId: string;
      outcome: string;
      newVersion?: number | null;
      errors?: unknown;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const [row] = await txDb
      .insert(syncOp)
      .values({
        opId: data.opId,
        deviceId: data.deviceId,
        entity: data.entity,
        recordId: data.recordId,
        outcome: data.outcome,
        newVersion: data.newVersion ?? null,
        errors: data.errors ?? null,
      })
      .onConflictDoNothing()
      .returning();

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
    },
    txDb: DatabaseOrTx = db,
  ) {
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
        payload: data.payload as Record<string, unknown>,
        reason: data.reason,
      })
      .returning();

    return row!;
  }

  async writeChangeLog(
    data: {
      entity: string;
      recordId: string;
      op: 'upsert' | 'delete';
      schemeId?: string | null;
      stateId?: string | null;
      data: Record<string, unknown>;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const [row] = await txDb
      .insert(changeLog)
      .values({
        entity: data.entity,
        recordId: data.recordId,
        op: data.op,
        schemeId: data.schemeId ?? null,
        stateId: data.stateId ?? null,
        data: data.data,
      })
      .returning();

    return row!;
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
        data: changeLog.data,
      })
      .from(changeLog)
      .where(and(...conditions))
      .orderBy(changeLog.xid, changeLog.seq)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mappedItems: SyncPullChangeItem[] = items.map((r) => ({
      xid: String(r.xid),
      seq: Number(r.seq),
      entity: r.entity,
      recordId: r.recordId,
      op: r.op as 'upsert' | 'delete',
      schemeId: r.schemeId ?? null,
      stateId: r.stateId ?? null,
      data: r.data as Record<string, unknown>,
    }));

    const last = mappedItems[mappedItems.length - 1];
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

  async listQuarantines(filters: Partial<ListSyncQuarantineQuery> = {}, txDb: DatabaseOrTx = db) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

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

  async findQuarantineById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(syncQuarantine)
      .where(eq(syncQuarantine.id, id))
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
