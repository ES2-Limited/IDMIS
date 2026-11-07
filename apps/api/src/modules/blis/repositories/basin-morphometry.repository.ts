import { Injectable } from '@nestjs/common';
import {
  db,
  basinMorphometry,
  basin,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  inArray,
  desc,
} from '@idmis/db';
import type { RequestScope, ListBasinMorphometryQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateBasinMorphometryData {
  id?: string;
  basinId: string;
  measuredOn: string;
  lowestPointM?: string | null;
  highestPointM?: string | null;
  avgSlopePct?: string | null;
  streamCount?: number | null;
  streamLengthTotalKm?: string | null;
  streamLengthAvgKm?: string | null;
  drainageDensity?: string | null;
  streamOrder?: number | null;
  reliefM?: string | null;
  lengthKm?: string | null;
  perimeterKm?: string | null;
  createdBy: string;
}

export interface UpdateBasinMorphometryData {
  basinId?: string;
  measuredOn?: string;
  lowestPointM?: string | null;
  highestPointM?: string | null;
  avgSlopePct?: string | null;
  streamCount?: number | null;
  streamLengthTotalKm?: string | null;
  streamLengthAvgKm?: string | null;
  drainageDensity?: string | null;
  streamOrder?: number | null;
  reliefM?: string | null;
  lengthKm?: string | null;
  perimeterKm?: string | null;
  updatedBy: string;
}

@Injectable()
export class BasinMorphometryRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    if (scope.rbdaIds.length > 0) {
      return inArray(
        basinMorphometry.basinId,
        db
          .select({ id: basin.id })
          .from(basin)
          .where(and(inArray(basin.rbdaId, scope.rbdaIds), isNull(basin.deletedAt))),
      );
    }
    return sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(basinMorphometry.id, id), isNull(basinMorphometry.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select()
      .from(basinMorphometry)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findByBasinAndDate(basinId: string, measuredOn: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(basinMorphometry)
      .where(
        and(
          eq(basinMorphometry.basinId, basinId),
          eq(basinMorphometry.measuredOn, measuredOn),
          isNull(basinMorphometry.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async list(query: ListBasinMorphometryQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(basinMorphometry.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.basinId) {
      conditions.push(eq(basinMorphometry.basinId, query.basinId));
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(basinMorphometry)
      .where(and(...conditions));

    const rows = await client
      .select()
      .from(basinMorphometry)
      .where(and(...conditions))
      .orderBy(desc(basinMorphometry.measuredOn), desc(basinMorphometry.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      total: countRes?.count ?? 0,
      page,
      limit,
    };
  }

  async create(data: CreateBasinMorphometryData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const id = data.id ?? crypto.randomUUID();

    const [created] = await client
      .insert(basinMorphometry)
      .values({
        id,
        basinId: data.basinId,
        measuredOn: data.measuredOn,
        lowestPointM: data.lowestPointM ?? null,
        highestPointM: data.highestPointM ?? null,
        avgSlopePct: data.avgSlopePct ?? null,
        streamCount: data.streamCount ?? null,
        streamLengthTotalKm: data.streamLengthTotalKm ?? null,
        streamLengthAvgKm: data.streamLengthAvgKm ?? null,
        drainageDensity: data.drainageDensity ?? null,
        streamOrder: data.streamOrder ?? null,
        reliefM: data.reliefM ?? null,
        lengthKm: data.lengthKm ?? null,
        perimeterKm: data.perimeterKm ?? null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      })
      .returning();

    return created;
  }

  async update(
    id: string,
    currentVersion: number,
    data: UpdateBasinMorphometryData,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    if (data.basinId !== undefined) updateFields.basinId = data.basinId;
    if (data.measuredOn !== undefined) updateFields.measuredOn = data.measuredOn;
    if (data.lowestPointM !== undefined) updateFields.lowestPointM = data.lowestPointM;
    if (data.highestPointM !== undefined) updateFields.highestPointM = data.highestPointM;
    if (data.avgSlopePct !== undefined) updateFields.avgSlopePct = data.avgSlopePct;
    if (data.streamCount !== undefined) updateFields.streamCount = data.streamCount;
    if (data.streamLengthTotalKm !== undefined)
      updateFields.streamLengthTotalKm = data.streamLengthTotalKm;
    if (data.streamLengthAvgKm !== undefined)
      updateFields.streamLengthAvgKm = data.streamLengthAvgKm;
    if (data.drainageDensity !== undefined) updateFields.drainageDensity = data.drainageDensity;
    if (data.streamOrder !== undefined) updateFields.streamOrder = data.streamOrder;
    if (data.reliefM !== undefined) updateFields.reliefM = data.reliefM;
    if (data.lengthKm !== undefined) updateFields.lengthKm = data.lengthKm;
    if (data.perimeterKm !== undefined) updateFields.perimeterKm = data.perimeterKm;

    const [updated] = await client
      .update(basinMorphometry)
      .set(updateFields)
      .where(
        and(
          eq(basinMorphometry.id, id),
          eq(basinMorphometry.version, currentVersion),
          isNull(basinMorphometry.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on basin morphometry update',
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
      .update(basinMorphometry)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(
        and(
          eq(basinMorphometry.id, id),
          eq(basinMorphometry.version, expectedVersion),
          isNull(basinMorphometry.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on basin morphometry delete',
        current,
        currentVersion: current?.version,
      });
    }

    return deleted;
  }
}
