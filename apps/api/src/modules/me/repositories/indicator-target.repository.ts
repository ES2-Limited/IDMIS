import { Injectable } from '@nestjs/common';
import {
  db,
  indicatorTarget,
  SYSTEM_USER_ID,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  desc,
} from '@idmis/db';
import type { RequestScope, ListIndicatorTargetsQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateIndicatorTargetData {
  id?: string;
  indicatorId: string;
  year: number;
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
  value: string;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface UpdateIndicatorTargetData {
  value: string;
  updatedBy?: string;
}

@Injectable()
export class IndicatorTargetRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(indicatorTarget.id, id), isNull(indicatorTarget.deletedAt)];

    if (scope) {
      const scopeCond = applyScope(scope, {
        state: indicatorTarget.scopeStateId,
        scheme: indicatorTarget.scopeOrgId,
      });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const [row] = await client
      .select()
      .from(indicatorTarget)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findBySlot(
    indicatorId: string,
    year: number,
    scopeType: string,
    scopeStateId: string | null,
    scopeOrgId: string | null,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [
      eq(indicatorTarget.indicatorId, indicatorId),
      eq(indicatorTarget.year, year),
      eq(
        indicatorTarget.scopeType,
        scopeType as 'national' | 'state' | 'scheme' | 'rbda' | 'sector',
      ),
      scopeStateId
        ? eq(indicatorTarget.scopeStateId, scopeStateId)
        : isNull(indicatorTarget.scopeStateId),
      scopeOrgId ? eq(indicatorTarget.scopeOrgId, scopeOrgId) : isNull(indicatorTarget.scopeOrgId),
      isNull(indicatorTarget.deletedAt),
    ];

    const [row] = await client
      .select()
      .from(indicatorTarget)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async listTargets(
    scope: RequestScope,
    filters: Partial<ListIndicatorTargetsQuery> = {},
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(indicatorTarget.deletedAt)];

    const scopeCond = applyScope(scope, {
      state: indicatorTarget.scopeStateId,
      scheme: indicatorTarget.scopeOrgId,
    });
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    if (filters.indicatorId) {
      conditions.push(eq(indicatorTarget.indicatorId, filters.indicatorId));
    }
    if (filters.year) {
      conditions.push(eq(indicatorTarget.year, filters.year));
    }
    if (filters.scopeType) {
      conditions.push(eq(indicatorTarget.scopeType, filters.scopeType));
    }

    return client
      .select()
      .from(indicatorTarget)
      .where(and(...conditions))
      .orderBy(desc(indicatorTarget.year), indicatorTarget.createdAt)
      .limit(limit);
  }

  async create(data: CreateIndicatorTargetData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .insert(indicatorTarget)
      .values({
        id: data.id ?? crypto.randomUUID(),
        indicatorId: data.indicatorId,
        year: data.year,
        scopeType: data.scopeType,
        scopeStateId: data.scopeStateId ?? null,
        scopeOrgId: data.scopeOrgId ?? null,
        value: data.value,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return row!;
  }

  async update(
    id: string,
    expectedVersion: number,
    data: UpdateIndicatorTargetData,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const [updated] = await client
      .update(indicatorTarget)
      .set({
        value: data.value,
        version: sql`${indicatorTarget.version} + 1`,
        updatedBy: data.updatedBy,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(indicatorTarget.id, id),
          eq(indicatorTarget.version, expectedVersion),
          isNull(indicatorTarget.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await client
        .select()
        .from(indicatorTarget)
        .where(eq(indicatorTarget.id, id))
        .limit(1);
      throw new ConflictProblemException({
        detail: 'Target record version mismatch or target not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }

    return updated;
  }

  async softDelete(id: string, deletedBy?: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [deleted] = await client
      .update(indicatorTarget)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(indicatorTarget.id, id), isNull(indicatorTarget.deletedAt)))
      .returning();

    return deleted ?? null;
  }
}
