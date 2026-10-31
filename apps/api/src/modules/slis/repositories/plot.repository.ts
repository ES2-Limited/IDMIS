import { and, eq, gt, ilike, sql, type SQL } from '@idmis/db';
import { db, plot, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListPlotsQuery, RecordStatus, ServiceType } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreatePlotData {
  id?: string;
  schemeId: string;
  farmId?: string | null;
  sectorId: string;
  plotCode: string;
  areaHa?: string | number | null;
  irrigationTypeId?: string | null;
  serviceType?: ServiceType | null;
  wardId?: string | null;
  stateId?: string | null;
  geom?: unknown;
  gpsAccuracyM?: string | number | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
}

export interface UpdatePlotData {
  farmId?: string | null;
  sectorId?: string;
  plotCode?: string;
  areaHa?: string | number | null;
  irrigationTypeId?: string | null;
  serviceType?: ServiceType | null;
  wardId?: string | null;
  stateId?: string | null;
  geom?: unknown;
  gpsAccuracyM?: string | number | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

@Injectable()
export class PlotRepository {
  async listPlots(
    scope: RequestScope,
    filters: Partial<ListPlotsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: plot.schemeId,
      state: plot.stateId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(plot.schemeId, filters.schemeId));
    }
    if (filters.farmId) {
      conditions.push(eq(plot.farmId, filters.farmId));
    }
    if (filters.sectorId) {
      conditions.push(eq(plot.sectorId, filters.sectorId));
    }
    if (filters.stateId) {
      conditions.push(eq(plot.stateId, filters.stateId));
    }
    if (filters.wardId) {
      conditions.push(eq(plot.wardId, filters.wardId));
    }
    if (filters.status) {
      conditions.push(eq(plot.status, filters.status));
    }
    if (filters.serviceType) {
      conditions.push(eq(plot.serviceType, filters.serviceType));
    }

    if (filters.search) {
      conditions.push(ilike(plot.plotCode, `%${filters.search}%`));
    }

    if (filters.cursor) {
      conditions.push(gt(plot.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(plot)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(plot.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(plot.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: plot.schemeId,
        state: plot.stateId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(plot)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreatePlotData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await txDb
      .insert(plot)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        areaHa: data.areaHa !== undefined && data.areaHa !== null ? String(data.areaHa) : null,
        gpsAccuracyM:
          data.gpsAccuracyM !== undefined && data.gpsAccuracyM !== null
            ? String(data.gpsAccuracyM)
            : null,
        status: data.status ?? 'draft',
        version: 1,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();

    return rows[0]!;
  }

  async update(id: string, expectedVersion: number, data: UpdatePlotData, txDb: DatabaseOrTx = db) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${plot.version} + 1`,
    };

    if (data.farmId !== undefined) updatePayload.farmId = data.farmId;
    if (data.sectorId !== undefined) updatePayload.sectorId = data.sectorId;
    if (data.plotCode !== undefined) updatePayload.plotCode = data.plotCode;
    if (data.areaHa !== undefined)
      updatePayload.areaHa = data.areaHa !== null ? String(data.areaHa) : null;
    if (data.irrigationTypeId !== undefined) updatePayload.irrigationTypeId = data.irrigationTypeId;
    if (data.serviceType !== undefined) updatePayload.serviceType = data.serviceType;
    if (data.wardId !== undefined) updatePayload.wardId = data.wardId;
    if (data.stateId !== undefined) updatePayload.stateId = data.stateId;
    if (data.geom !== undefined) updatePayload.geom = data.geom;
    if (data.gpsAccuracyM !== undefined)
      updatePayload.gpsAccuracyM = data.gpsAccuracyM !== null ? String(data.gpsAccuracyM) : null;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.updatedBy !== undefined && data.updatedBy !== null)
      updatePayload.updatedBy = data.updatedBy;

    const rows = await txDb
      .update(plot)
      .set(updatePayload)
      .where(and(eq(plot.id, id), eq(plot.version, expectedVersion)))
      .returning();

    return rows[0] ?? null;
  }
}
