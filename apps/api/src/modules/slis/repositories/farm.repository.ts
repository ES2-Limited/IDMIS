import { and, eq, gt, ilike, sql, type SQL } from '@idmis/db';
import { db, farm, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListFarmsQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateFarmData {
  id?: string;
  schemeId: string;
  sectorId: string;
  name?: string | null;
  geom?: unknown;
  createdBy?: string | null;
}

export interface UpdateFarmData {
  sectorId?: string;
  name?: string | null;
  geom?: unknown;
  updatedBy?: string | null;
}

@Injectable()
export class FarmRepository {
  async listFarms(
    scope: RequestScope,
    filters: Partial<ListFarmsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: farm.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(farm.schemeId, filters.schemeId));
    }
    if (filters.sectorId) {
      conditions.push(eq(farm.sectorId, filters.sectorId));
    }

    if (filters.search) {
      conditions.push(ilike(farm.name, `%${filters.search}%`));
    }

    if (filters.cursor) {
      conditions.push(gt(farm.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(farm)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(farm.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(farm.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: farm.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(farm)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreateFarmData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await txDb
      .insert(farm)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        name: data.name ?? 'Farm',
        version: 1,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();

    return rows[0]!;
  }

  async update(id: string, expectedVersion: number, data: UpdateFarmData, txDb: DatabaseOrTx = db) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${farm.version} + 1`,
    };

    if (data.sectorId !== undefined) updatePayload.sectorId = data.sectorId;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.geom !== undefined) updatePayload.geom = data.geom;
    if (data.updatedBy !== undefined && data.updatedBy !== null)
      updatePayload.updatedBy = data.updatedBy;

    const rows = await txDb
      .update(farm)
      .set(updatePayload)
      .where(and(eq(farm.id, id), eq(farm.version, expectedVersion)))
      .returning();

    return rows[0] ?? null;
  }
}
