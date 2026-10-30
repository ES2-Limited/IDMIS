import { and, eq, gt, sql, type SQL } from '@idmis/db';
import { db, household, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListHouseholdsQuery, RecordStatus } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateHouseholdData {
  id?: string;
  schemeId: string;
  wardId?: string | null;
  name?: string;
  settlement?: string | null;
  size?: number | null;
  males?: number | null;
  females?: number | null;
  children?: number | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
}

export interface UpdateHouseholdData {
  wardId?: string | null;
  name?: string;
  settlement?: string | null;
  size?: number | null;
  males?: number | null;
  females?: number | null;
  children?: number | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

@Injectable()
export class HouseholdRepository {
  async listHouseholds(
    scope: RequestScope,
    filters: Partial<ListHouseholdsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: household.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(household.schemeId, filters.schemeId));
    }
    if (filters.wardId) {
      conditions.push(eq(household.wardId, filters.wardId));
    }
    if (filters.status) {
      conditions.push(eq(household.status, filters.status));
    }

    if (filters.cursor) {
      conditions.push(gt(household.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(household)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(household.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(household.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: household.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(household)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreateHouseholdData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await txDb
      .insert(household)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        name: data.name ?? 'Household',
        status: data.status ?? 'draft',
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
    data: UpdateHouseholdData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${household.version} + 1`,
    };

    if (data.wardId !== undefined) updatePayload.wardId = data.wardId;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.settlement !== undefined) updatePayload.settlement = data.settlement;
    if (data.size !== undefined) updatePayload.size = data.size;
    if (data.males !== undefined) updatePayload.males = data.males;
    if (data.females !== undefined) updatePayload.females = data.females;
    if (data.children !== undefined) updatePayload.children = data.children;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.updatedBy !== undefined && data.updatedBy !== null)
      updatePayload.updatedBy = data.updatedBy;

    const rows = await txDb
      .update(household)
      .set(updatePayload)
      .where(and(eq(household.id, id), eq(household.version, expectedVersion)))
      .returning();

    return rows[0] ?? null;
  }
}
