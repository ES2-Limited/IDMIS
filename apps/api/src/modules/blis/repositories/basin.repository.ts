import { Injectable } from '@nestjs/common';
import { db, basin, eq, and, isNull, sql, type SQL, inArray, desc, ilike, or } from '@idmis/db';
import type { RequestScope, ListBasinsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { validateAndBuildGeometrySql } from '../utils/geometry.helper';

export interface CreateBasinData {
  id?: string;
  code: string;
  name: string;
  altName?: string | null;
  hydrologicalUnit?: string | null;
  mainRiver?: string | null;
  rbdaId?: string | null;
  geom?: unknown;
  createdBy: string;
  importBatchId?: string | null;
}

export interface UpdateBasinData {
  code?: string;
  name?: string;
  altName?: string | null;
  hydrologicalUnit?: string | null;
  mainRiver?: string | null;
  rbdaId?: string | null;
  geom?: unknown;
  updatedBy: string;
}

@Injectable()
export class BasinRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    if (scope.rbdaIds.length > 0) {
      return inArray(basin.rbdaId, scope.rbdaIds);
    }
    return sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(basin.id, id), isNull(basin.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: basin.id,
        code: basin.code,
        name: basin.name,
        altName: basin.altName,
        hydrologicalUnit: basin.hydrologicalUnit,
        mainRiver: basin.mainRiver,
        rbdaId: basin.rbdaId,
        geom: sql<unknown>`ST_AsGeoJSON(${basin.geom})::json`,
        createdAt: basin.createdAt,
        createdBy: basin.createdBy,
        updatedAt: basin.updatedAt,
        updatedBy: basin.updatedBy,
        version: basin.version,
        importBatchId: basin.importBatchId,
      })
      .from(basin)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async findByCode(code: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(basin.code, code), isNull(basin.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: basin.id,
        code: basin.code,
        name: basin.name,
        altName: basin.altName,
        hydrologicalUnit: basin.hydrologicalUnit,
        mainRiver: basin.mainRiver,
        rbdaId: basin.rbdaId,
        geom: sql<unknown>`ST_AsGeoJSON(${basin.geom})::json`,
        createdAt: basin.createdAt,
        createdBy: basin.createdBy,
        updatedAt: basin.updatedAt,
        updatedBy: basin.updatedBy,
        version: basin.version,
        importBatchId: basin.importBatchId,
      })
      .from(basin)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async list(query: ListBasinsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(basin.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.rbdaId) {
      conditions.push(eq(basin.rbdaId, query.rbdaId));
    }

    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(basin.name, searchPattern),
          ilike(basin.code, searchPattern),
          ilike(basin.altName, searchPattern),
        )!,
      );
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(basin)
      .where(and(...conditions));

    const rows = await client
      .select({
        id: basin.id,
        code: basin.code,
        name: basin.name,
        altName: basin.altName,
        hydrologicalUnit: basin.hydrologicalUnit,
        mainRiver: basin.mainRiver,
        rbdaId: basin.rbdaId,
        geom: sql<unknown>`ST_AsGeoJSON(${basin.geom})::json`,
        createdAt: basin.createdAt,
        createdBy: basin.createdBy,
        updatedAt: basin.updatedAt,
        updatedBy: basin.updatedBy,
        version: basin.version,
        importBatchId: basin.importBatchId,
      })
      .from(basin)
      .where(and(...conditions))
      .orderBy(desc(basin.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      total: countRes?.count ?? 0,
      page,
      limit,
    };
  }

  async create(data: CreateBasinData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const id = data.id ?? crypto.randomUUID();
    const geomSql = validateAndBuildGeometrySql(data.geom, 'MultiPolygon');

    const [created] = await client
      .insert(basin)
      .values({
        id,
        code: data.code,
        name: data.name,
        altName: data.altName ?? null,
        hydrologicalUnit: data.hydrologicalUnit ?? null,
        mainRiver: data.mainRiver ?? null,
        rbdaId: data.rbdaId ?? null,
        geom: geomSql ? (geomSql as unknown as unknown[]) : null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
        importBatchId: data.importBatchId ?? null,
      })
      .returning();

    return this.findById(created.id, undefined, txDb);
  }

  async update(id: string, currentVersion: number, data: UpdateBasinData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    if (data.code !== undefined) updateFields.code = data.code;
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.altName !== undefined) updateFields.altName = data.altName;
    if (data.hydrologicalUnit !== undefined) updateFields.hydrologicalUnit = data.hydrologicalUnit;
    if (data.mainRiver !== undefined) updateFields.mainRiver = data.mainRiver;
    if (data.rbdaId !== undefined) updateFields.rbdaId = data.rbdaId;
    if (data.geom !== undefined) {
      updateFields.geom = validateAndBuildGeometrySql(data.geom, 'MultiPolygon');
    }

    const [updated] = await client
      .update(basin)
      .set(updateFields)
      .where(and(eq(basin.id, id), eq(basin.version, currentVersion), isNull(basin.deletedAt)))
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on basin update',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    return this.findById(id, undefined, txDb);
  }

  async softDelete(id: string, expectedVersion: number, actorUserId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [deleted] = await client
      .update(basin)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(and(eq(basin.id, id), eq(basin.version, expectedVersion), isNull(basin.deletedAt)))
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on basin delete',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    return deleted;
  }
}
