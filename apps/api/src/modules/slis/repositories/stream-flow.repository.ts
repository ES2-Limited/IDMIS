import { and, eq, gt, gte, lte, sql, type SQL } from '@idmis/db';
import { db, streamFlowReading, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListStreamFlowReadingsQuery, RecordStatus } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface RecordStreamFlowData {
  id?: string;
  schemeId: string;
  stationId: string;
  readAt: string;
  value: string | number;
  unit?: string;
  gaugeHeightM?: string | number | null;
  location?: unknown;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

@Injectable()
export class StreamFlowRepository {
  async listStreamFlows(
    scope: RequestScope,
    filters: Partial<ListStreamFlowReadingsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: streamFlowReading.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(streamFlowReading.schemeId, filters.schemeId));
    }
    if (filters.stationId) {
      conditions.push(eq(streamFlowReading.stationId, filters.stationId));
    }
    if (filters.fromReadAt) {
      conditions.push(gte(streamFlowReading.readAt, filters.fromReadAt));
    }
    if (filters.toReadAt) {
      conditions.push(lte(streamFlowReading.readAt, filters.toReadAt));
    }
    if (filters.status) {
      conditions.push(eq(streamFlowReading.status, filters.status));
    }

    if (filters.cursor) {
      conditions.push(gt(streamFlowReading.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(streamFlowReading)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(streamFlowReading.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(streamFlowReading.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: streamFlowReading.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(streamFlowReading)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: RecordStreamFlowData, txDb: DatabaseOrTx = db) {
    const id = data.id ?? crypto.randomUUID();
    const rows = await txDb
      .insert(streamFlowReading)
      .values({
        id,
        schemeId: data.schemeId,
        stationId: data.stationId,
        readAt: data.readAt,
        value: String(data.value),
        unit: data.unit ?? 'm3/s',
        gaugeHeightM: data.gaugeHeightM != null ? String(data.gaugeHeightM) : null,
        location: data.location ?? null,
        status: data.status ?? 'draft',
        deviceId: data.deviceId ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return rows[0]!;
  }

  async update(
    id: string,
    expectedVersion: number,
    data: Partial<RecordStreamFlowData>,
    txDb?: DatabaseOrTx,
  ) {
    const client = txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${streamFlowReading.version} + 1`,
    };
    if (data.stationId !== undefined) updateValues.stationId = data.stationId;
    if (data.readAt !== undefined) updateValues.readAt = data.readAt;
    if (data.value !== undefined) updateValues.value = String(data.value);
    if (data.unit !== undefined) updateValues.unit = data.unit;
    if (data.updatedBy !== undefined) updateValues.updatedBy = data.updatedBy;

    const rows = await client
      .update(streamFlowReading)
      .set(updateValues)
      .where(and(eq(streamFlowReading.id, id), eq(streamFlowReading.version, expectedVersion)))
      .returning();

    if (rows.length === 0) {
      const current = await this.findById(id, undefined, client);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on stream flow reading update',
        current,
        currentVersion: current ? Number(current.version) : 0,
      });
    }
    return rows[0]!;
  }
}
