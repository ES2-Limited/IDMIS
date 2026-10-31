import { and, eq, gt, sql, type SQL } from '@idmis/db';
import { db, cropProduction, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListCropProductionsQuery, RecordStatus } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateCropProductionData {
  id?: string;
  schemeId: string;
  plotId: string;
  seasonId: string;
  cropTypeId: string;
  areaHa: string | number;
  yieldT?: string | number | null;
  plantedOn?: string | null;
  harvestedOn?: string | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
}

export interface UpdateCropProductionData {
  areaHa?: string | number;
  yieldT?: string | number | null;
  plantedOn?: string | null;
  harvestedOn?: string | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

@Injectable()
export class CropProductionRepository {
  async listCropProductions(
    scope: RequestScope,
    filters: Partial<ListCropProductionsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: cropProduction.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(cropProduction.schemeId, filters.schemeId));
    }
    if (filters.plotId) {
      conditions.push(eq(cropProduction.plotId, filters.plotId));
    }
    if (filters.seasonId) {
      conditions.push(eq(cropProduction.seasonId, filters.seasonId));
    }
    if (filters.cropTypeId) {
      conditions.push(eq(cropProduction.cropTypeId, filters.cropTypeId));
    }
    if (filters.status) {
      conditions.push(eq(cropProduction.status, filters.status));
    }

    if (filters.cursor) {
      conditions.push(gt(cropProduction.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(cropProduction)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(cropProduction.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(cropProduction.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: cropProduction.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(cropProduction)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreateCropProductionData, txDb: DatabaseOrTx = db) {
    const id = data.id ?? crypto.randomUUID();
    const rows = await txDb
      .insert(cropProduction)
      .values({
        id,
        schemeId: data.schemeId,
        plotId: data.plotId,
        seasonId: data.seasonId,
        cropTypeId: data.cropTypeId,
        areaHa: String(data.areaHa),
        yieldT: data.yieldT != null ? String(data.yieldT) : null,
        plantedOn: data.plantedOn ?? null,
        harvestedOn: data.harvestedOn ?? null,
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

  async update(
    id: string,
    version: number,
    data: UpdateCropProductionData,
    txDb: DatabaseOrTx = db,
  ) {
    const updateValues: Record<string, unknown> = {
      updatedBy: data.updatedBy ?? SYSTEM_USER_ID,
      updatedAt: new Date().toISOString(),
      version: sql`${cropProduction.version} + 1`,
    };

    if (data.areaHa !== undefined) {
      updateValues.areaHa = String(data.areaHa);
    }
    if (data.yieldT !== undefined) {
      updateValues.yieldT = data.yieldT != null ? String(data.yieldT) : null;
    }
    if (data.plantedOn !== undefined) {
      updateValues.plantedOn = data.plantedOn;
    }
    if (data.harvestedOn !== undefined) {
      updateValues.harvestedOn = data.harvestedOn;
    }
    if (data.status !== undefined) {
      updateValues.status = data.status;
    }

    const rows = await txDb
      .update(cropProduction)
      .set(updateValues)
      .where(and(eq(cropProduction.id, id), eq(cropProduction.version, version)))
      .returning();

    return rows[0] ?? null;
  }
}
