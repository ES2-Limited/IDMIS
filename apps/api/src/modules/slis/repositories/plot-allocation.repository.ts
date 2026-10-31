import { and, eq, gt, sql, type SQL } from '@idmis/db';
import { db, plot, plotAllocation, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListPlotAllocationsQuery, RecordStatus } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreatePlotAllocationData {
  id?: string;
  plotId: string;
  farmerId: string;
  seasonId?: string | null;
  tenureId?: string | null;
  fromOn?: string | null;
  toOn?: string | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
}

export interface UpdatePlotAllocationData {
  seasonId?: string | null;
  tenureId?: string | null;
  fromOn?: string | null;
  toOn?: string | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

@Injectable()
export class PlotAllocationRepository {
  async listAllocations(
    scope: RequestScope,
    filters: Partial<ListPlotAllocationsQuery> = {},
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

    if (filters.plotId) {
      conditions.push(eq(plotAllocation.plotId, filters.plotId));
    }
    if (filters.farmerId) {
      conditions.push(eq(plotAllocation.farmerId, filters.farmerId));
    }
    if (filters.seasonId) {
      conditions.push(eq(plotAllocation.seasonId, filters.seasonId));
    }
    if (filters.status) {
      conditions.push(eq(plotAllocation.status, filters.status));
    }

    if (filters.cursor) {
      conditions.push(gt(plotAllocation.id, filters.cursor));
    }

    const rows = await txDb
      .select({
        id: plotAllocation.id,
        plotId: plotAllocation.plotId,
        farmerId: plotAllocation.farmerId,
        seasonId: plotAllocation.seasonId,
        tenureId: plotAllocation.tenureId,
        fromOn: plotAllocation.fromOn,
        toOn: plotAllocation.toOn,
        status: plotAllocation.status,
        version: plotAllocation.version,
        submittedAt: plotAllocation.submittedAt,
        submittedBy: plotAllocation.submittedBy,
        approvedAt: plotAllocation.approvedAt,
        approvedBy: plotAllocation.approvedBy,
        returnedAt: plotAllocation.returnedAt,
        returnedBy: plotAllocation.returnedBy,
        returnComment: plotAllocation.returnComment,
        deviceId: plotAllocation.deviceId,
        importBatchId: plotAllocation.importBatchId,
        createdAt: plotAllocation.createdAt,
        createdBy: plotAllocation.createdBy,
        updatedAt: plotAllocation.updatedAt,
        updatedBy: plotAllocation.updatedBy,
        deletedAt: plotAllocation.deletedAt,
      })
      .from(plotAllocation)
      .innerJoin(plot, eq(plotAllocation.plotId, plot.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(plotAllocation.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(plotAllocation.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: plot.schemeId,
        state: plot.stateId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select({
        id: plotAllocation.id,
        plotId: plotAllocation.plotId,
        farmerId: plotAllocation.farmerId,
        seasonId: plotAllocation.seasonId,
        tenureId: plotAllocation.tenureId,
        fromOn: plotAllocation.fromOn,
        toOn: plotAllocation.toOn,
        status: plotAllocation.status,
        version: plotAllocation.version,
        submittedAt: plotAllocation.submittedAt,
        submittedBy: plotAllocation.submittedBy,
        approvedAt: plotAllocation.approvedAt,
        approvedBy: plotAllocation.approvedBy,
        returnedAt: plotAllocation.returnedAt,
        returnedBy: plotAllocation.returnedBy,
        returnComment: plotAllocation.returnComment,
        deviceId: plotAllocation.deviceId,
        importBatchId: plotAllocation.importBatchId,
        createdAt: plotAllocation.createdAt,
        createdBy: plotAllocation.createdBy,
        updatedAt: plotAllocation.updatedAt,
        updatedBy: plotAllocation.updatedBy,
        deletedAt: plotAllocation.deletedAt,
        schemeId: plot.schemeId,
        stateId: plot.stateId,
      })
      .from(plotAllocation)
      .innerJoin(plot, eq(plotAllocation.plotId, plot.id))
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreatePlotAllocationData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await txDb
      .insert(plotAllocation)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        status: data.status ?? 'draft',
        submittedBy: data.submittedBy ?? (data.status === 'submitted' ? creator : null),
        submittedAt:
          data.submittedAt ?? (data.status === 'submitted' ? new Date().toISOString() : null),
        version: 1,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();

    return rows[0]!;
  }

  async update(
    id: string,
    expectedVersion: number,
    data: UpdatePlotAllocationData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${plotAllocation.version} + 1`,
    };

    if (data.seasonId !== undefined) updatePayload.seasonId = data.seasonId;
    if (data.tenureId !== undefined) updatePayload.tenureId = data.tenureId;
    if (data.fromOn !== undefined) updatePayload.fromOn = data.fromOn;
    if (data.toOn !== undefined) updatePayload.toOn = data.toOn;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.updatedBy !== undefined && data.updatedBy !== null)
      updatePayload.updatedBy = data.updatedBy;

    const rows = await txDb
      .update(plotAllocation)
      .set(updatePayload)
      .where(and(eq(plotAllocation.id, id), eq(plotAllocation.version, expectedVersion)))
      .returning();

    return rows[0] ?? null;
  }
}
