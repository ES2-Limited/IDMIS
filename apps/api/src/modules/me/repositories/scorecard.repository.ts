import { Injectable } from '@nestjs/common';
import { db, scorecard, eq, and, isNull, sql, type SQL, inArray, or, desc } from '@idmis/db';
import type { RequestScope, ListScorecardsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateScorecardData {
  id?: string;
  schemeId: string;
  periodYear: number;
  publishedOn?: string | null;
  fileId?: string | null;
  createdBy: string;
}

export interface UpdateScorecardData {
  schemeId?: string;
  periodYear?: number;
  publishedOn?: string | null;
  fileId?: string | null;
  updatedBy: string;
}

@Injectable()
export class ScorecardRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    const scopeParts: SQL[] = [];
    if (scope.schemeIds.length > 0) {
      scopeParts.push(inArray(scorecard.schemeId, scope.schemeIds));
    }
    if (scope.stateIds.length > 0) {
      scopeParts.push(
        sql`EXISTS (
          SELECT 1 FROM "core"."organisation_state" "os"
          WHERE "os"."organisation_id" = ${scorecard.schemeId}
            AND "os"."state_id" IN ${scope.stateIds}
        )`,
      );
    }
    return scopeParts.length > 0 ? or(...scopeParts)! : sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(scorecard.id, id), isNull(scorecard.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select()
      .from(scorecard)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findBySchemeAndYear(schemeId: string, periodYear: number, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(scorecard)
      .where(
        and(
          eq(scorecard.schemeId, schemeId),
          eq(scorecard.periodYear, periodYear),
          isNull(scorecard.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async list(query: ListScorecardsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(scorecard.deletedAt)];

    if (query.schemeId) {
      conditions.push(eq(scorecard.schemeId, query.schemeId));
    }
    if (query.periodYear) {
      conditions.push(eq(scorecard.periodYear, query.periodYear));
    }

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const limit = query.limit ?? 50;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(scorecard)
      .where(and(...conditions));

    const items = await client
      .select()
      .from(scorecard)
      .where(and(...conditions))
      .orderBy(desc(scorecard.periodYear), desc(scorecard.createdAt))
      .limit(limit);

    return {
      data: items,
      total: countRes?.count ?? 0,
      limit,
    };
  }

  async create(data: CreateScorecardData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [created] = await client
      .insert(scorecard)
      .values({
        id: data.id ?? crypto.randomUUID(),
        schemeId: data.schemeId,
        periodYear: data.periodYear,
        publishedOn: data.publishedOn ?? null,
        fileId: data.fileId ?? null,
        createdAt: now,
        createdBy: data.createdBy,
        updatedAt: now,
        updatedBy: data.createdBy,
      })
      .returning();

    return created;
  }

  async update(id: string, currentVersion: number, data: UpdateScorecardData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
    };
    if (data.schemeId !== undefined) updateFields.schemeId = data.schemeId;
    if (data.periodYear !== undefined) updateFields.periodYear = data.periodYear;
    if (data.publishedOn !== undefined) updateFields.publishedOn = data.publishedOn;
    if (data.fileId !== undefined) updateFields.fileId = data.fileId;

    const [updated] = await client
      .update(scorecard)
      .set(updateFields)
      .where(
        and(
          eq(scorecard.id, id),
          eq(scorecard.version, currentVersion),
          isNull(scorecard.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on scorecard update',
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
      .update(scorecard)
      .set({
        deletedAt: now,
        updatedBy: actorUserId,
      })
      .where(
        and(
          eq(scorecard.id, id),
          eq(scorecard.version, expectedVersion),
          isNull(scorecard.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      if (current) {
        throw new ConflictProblemException({
          detail: 'Optimistic concurrency conflict on scorecard delete',
          current,
          currentVersion: current.version,
        });
      }
      return null;
    }

    return deleted;
  }
}
