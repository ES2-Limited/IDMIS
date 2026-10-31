import { and, eq, gt, sql, type SQL } from '@idmis/db';
import { db, waterRequest, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type {
  RequestScope,
  ListWaterRequestsQuery,
  RecordStatus,
  RequestLevel,
  WaterDecision,
} from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateWaterRequestData {
  id?: string;
  schemeId: string;
  level: RequestLevel;
  wuaId?: string | null;
  farmerId?: string | null;
  seasonId?: string | null;
  requestedVolumeM3?: string | number | null;
  periodFromOn?: string | null;
  periodToOn?: string | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
}

export interface UpdateWaterRequestData {
  requestedVolumeM3?: string | number | null;
  periodFromOn?: string | null;
  periodToOn?: string | null;
  decision?: WaterDecision;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

@Injectable()
export class WaterRequestRepository {
  async listWaterRequests(
    scope: RequestScope,
    filters: Partial<ListWaterRequestsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: waterRequest.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(waterRequest.schemeId, filters.schemeId));
    }
    if (filters.level) {
      conditions.push(eq(waterRequest.level, filters.level));
    }
    if (filters.wuaId) {
      conditions.push(eq(waterRequest.wuaId, filters.wuaId));
    }
    if (filters.farmerId) {
      conditions.push(eq(waterRequest.farmerId, filters.farmerId));
    }
    if (filters.seasonId) {
      conditions.push(eq(waterRequest.seasonId, filters.seasonId));
    }
    if (filters.decision) {
      conditions.push(eq(waterRequest.decision, filters.decision));
    }
    if (filters.status) {
      conditions.push(eq(waterRequest.status, filters.status));
    }

    if (filters.cursor) {
      conditions.push(gt(waterRequest.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(waterRequest)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(waterRequest.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(waterRequest.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: waterRequest.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(waterRequest)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreateWaterRequestData, txDb: DatabaseOrTx = db) {
    const id = data.id ?? crypto.randomUUID();
    const rows = await txDb
      .insert(waterRequest)
      .values({
        id,
        schemeId: data.schemeId,
        level: data.level,
        wuaId: data.wuaId ?? null,
        farmerId: data.farmerId ?? null,
        seasonId: data.seasonId ?? null,
        requestedVolumeM3: data.requestedVolumeM3 != null ? String(data.requestedVolumeM3) : null,
        periodFromOn: data.periodFromOn ?? null,
        periodToOn: data.periodToOn ?? null,
        status: data.status ?? 'draft',
        submittedBy:
          data.submittedBy ??
          (data.status === 'submitted' ? (data.createdBy ?? SYSTEM_USER_ID) : null),
        submittedAt:
          data.submittedAt ?? (data.status === 'submitted' ? new Date().toISOString() : null),
        deviceId: data.deviceId ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return rows[0]!;
  }

  async update(id: string, version: number, data: UpdateWaterRequestData, txDb: DatabaseOrTx = db) {
    const updateValues: Record<string, unknown> = {
      updatedBy: data.updatedBy ?? SYSTEM_USER_ID,
      updatedAt: new Date().toISOString(),
      version: sql`${waterRequest.version} + 1`,
    };

    if (data.requestedVolumeM3 !== undefined) {
      updateValues.requestedVolumeM3 =
        data.requestedVolumeM3 != null ? String(data.requestedVolumeM3) : null;
    }
    if (data.periodFromOn !== undefined) {
      updateValues.periodFromOn = data.periodFromOn;
    }
    if (data.periodToOn !== undefined) {
      updateValues.periodToOn = data.periodToOn;
    }
    if (data.decision !== undefined) {
      updateValues.decision = data.decision;
    }
    if (data.decidedBy !== undefined) {
      updateValues.decidedBy = data.decidedBy;
    }
    if (data.decidedAt !== undefined) {
      updateValues.decidedAt = data.decidedAt;
    }
    if (data.decisionNotes !== undefined) {
      updateValues.decisionNotes = data.decisionNotes;
    }
    if (data.status !== undefined) {
      updateValues.status = data.status;
    }

    const rows = await txDb
      .update(waterRequest)
      .set(updateValues)
      .where(and(eq(waterRequest.id, id), eq(waterRequest.version, version)))
      .returning();

    return rows[0] ?? null;
  }
}
