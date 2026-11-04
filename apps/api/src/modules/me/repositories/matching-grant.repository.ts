import { Injectable } from '@nestjs/common';
import { db, matchingGrant, eq, and, isNull, sql, type SQL, inArray, or, desc } from '@idmis/db';
import type { RequestScope, ListMatchingGrantsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateMatchingGrantData {
  id?: string;
  schemeId: string;
  wuaId?: string | null;
  purpose?: string | null;
  amountNgn: string;
  approvedOn?: string | null;
  disbursedOn?: string | null;
  importBatchId?: string | null;
  createdBy: string;
}

export interface UpdateMatchingGrantData {
  schemeId?: string;
  wuaId?: string | null;
  purpose?: string | null;
  amountNgn?: string;
  approvedOn?: string | null;
  disbursedOn?: string | null;
  updatedBy: string;
}

@Injectable()
export class MatchingGrantRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    const scopeParts: SQL[] = [];
    if (scope.schemeIds.length > 0) {
      scopeParts.push(inArray(matchingGrant.schemeId, scope.schemeIds));
    }
    if (scope.stateIds.length > 0) {
      scopeParts.push(
        sql`EXISTS (
          SELECT 1 FROM "core"."organisation_state" "os"
          WHERE "os"."organisation_id" = ${matchingGrant.schemeId}
            AND "os"."state_id" IN ${scope.stateIds}
        )`,
      );
    }
    return scopeParts.length > 0 ? or(...scopeParts)! : sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(matchingGrant.id, id), isNull(matchingGrant.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select()
      .from(matchingGrant)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async list(query: ListMatchingGrantsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(matchingGrant.deletedAt)];

    if (query.schemeId) {
      conditions.push(eq(matchingGrant.schemeId, query.schemeId));
    }
    if (query.wuaId) {
      conditions.push(eq(matchingGrant.wuaId, query.wuaId));
    }

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const limit = query.limit ?? 50;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(matchingGrant)
      .where(and(...conditions));

    const items = await client
      .select()
      .from(matchingGrant)
      .where(and(...conditions))
      .orderBy(desc(matchingGrant.createdAt))
      .limit(limit);

    return {
      data: items,
      total: countRes?.count ?? 0,
      limit,
    };
  }

  async create(data: CreateMatchingGrantData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [created] = await client
      .insert(matchingGrant)
      .values({
        id: data.id ?? crypto.randomUUID(),
        schemeId: data.schemeId,
        wuaId: data.wuaId ?? null,
        purpose: data.purpose ?? null,
        amountNgn: data.amountNgn,
        approvedOn: data.approvedOn ?? null,
        disbursedOn: data.disbursedOn ?? null,
        importBatchId: data.importBatchId ?? null,
        createdAt: now,
        createdBy: data.createdBy,
        updatedAt: now,
        updatedBy: data.createdBy,
      })
      .returning();

    return created;
  }

  async update(
    id: string,
    currentVersion: number,
    data: UpdateMatchingGrantData,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
    };
    if (data.schemeId !== undefined) updateFields.schemeId = data.schemeId;
    if (data.wuaId !== undefined) updateFields.wuaId = data.wuaId;
    if (data.purpose !== undefined) updateFields.purpose = data.purpose;
    if (data.amountNgn !== undefined) updateFields.amountNgn = data.amountNgn;
    if (data.approvedOn !== undefined) updateFields.approvedOn = data.approvedOn;
    if (data.disbursedOn !== undefined) updateFields.disbursedOn = data.disbursedOn;

    const [updated] = await client
      .update(matchingGrant)
      .set(updateFields)
      .where(
        and(
          eq(matchingGrant.id, id),
          eq(matchingGrant.version, currentVersion),
          isNull(matchingGrant.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on matching grant update',
        current,
        currentVersion: current?.version,
      });
    }

    return updated;
  }

  async softDelete(id: string, expectedVersion: number, actorUserId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [deleted] = await client
      .update(matchingGrant)
      .set({
        deletedAt: now,
        updatedBy: actorUserId,
      })
      .where(
        and(
          eq(matchingGrant.id, id),
          eq(matchingGrant.version, expectedVersion),
          isNull(matchingGrant.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      if (current) {
        throw new ConflictProblemException({
          detail: 'Optimistic concurrency conflict on matching grant delete',
          current,
          currentVersion: current.version,
        });
      }
      return null;
    }

    return deleted;
  }
}
