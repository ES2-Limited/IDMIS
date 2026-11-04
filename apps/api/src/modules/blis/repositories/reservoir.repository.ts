import { Injectable } from '@nestjs/common';
import {
  db,
  reservoir,
  basin,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  inArray,
  desc,
  ilike,
} from '@idmis/db';
import type { RequestScope, ListReservoirsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { toGeometrySql, parseGeoJsonResult } from '../utils/geometry.helper';

export interface CreateReservoirData {
  id?: string;
  basinId: string;
  name: string;
  river?: string | null;
  areaKm2?: string | null;
  volumeMcm?: string | null;
  meanDepthM?: string | null;
  maxDepthM?: string | null;
  relativeDepth?: string | null;
  maxLengthKm?: string | null;
  maxWidthKm?: string | null;
  meanElevationM?: string | null;
  sedimentRatio?: string | null;
  fetchKm?: string | null;
  depthRatio?: string | null;
  volumeDevelopment?: string | null;
  geom?: unknown;
  createdBy: string;
  importBatchId?: string | null;
}

export interface UpdateReservoirData {
  basinId?: string;
  name?: string;
  river?: string | null;
  areaKm2?: string | null;
  volumeMcm?: string | null;
  meanDepthM?: string | null;
  maxDepthM?: string | null;
  relativeDepth?: string | null;
  maxLengthKm?: string | null;
  maxWidthKm?: string | null;
  meanElevationM?: string | null;
  sedimentRatio?: string | null;
  fetchKm?: string | null;
  depthRatio?: string | null;
  volumeDevelopment?: string | null;
  geom?: unknown;
  updatedBy: string;
}

@Injectable()
export class ReservoirRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    if (scope.rbdaIds.length > 0) {
      return inArray(
        reservoir.basinId,
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
    const conditions: SQL[] = [eq(reservoir.id, id), isNull(reservoir.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: reservoir.id,
        basinId: reservoir.basinId,
        name: reservoir.name,
        river: reservoir.river,
        areaKm2: reservoir.areaKm2,
        volumeMcm: reservoir.volumeMcm,
        meanDepthM: reservoir.meanDepthM,
        maxDepthM: reservoir.maxDepthM,
        relativeDepth: reservoir.relativeDepth,
        maxLengthKm: reservoir.maxLengthKm,
        maxWidthKm: reservoir.maxWidthKm,
        meanElevationM: reservoir.meanElevationM,
        sedimentRatio: reservoir.sedimentRatio,
        fetchKm: reservoir.fetchKm,
        depthRatio: reservoir.depthRatio,
        volumeDevelopment: reservoir.volumeDevelopment,
        geom: reservoir.geom,
        createdAt: reservoir.createdAt,
        createdBy: reservoir.createdBy,
        updatedAt: reservoir.updatedAt,
        updatedBy: reservoir.updatedBy,
        version: reservoir.version,
        importBatchId: reservoir.importBatchId,
      })
      .from(reservoir)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      geom: parseGeoJsonResult(row.geom),
    };
  }

  async findByNameAndBasin(name: string, basinId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select({
        id: reservoir.id,
        basinId: reservoir.basinId,
        name: reservoir.name,
        river: reservoir.river,
        areaKm2: reservoir.areaKm2,
        volumeMcm: reservoir.volumeMcm,
        meanDepthM: reservoir.meanDepthM,
        maxDepthM: reservoir.maxDepthM,
        relativeDepth: reservoir.relativeDepth,
        maxLengthKm: reservoir.maxLengthKm,
        maxWidthKm: reservoir.maxWidthKm,
        meanElevationM: reservoir.meanElevationM,
        sedimentRatio: reservoir.sedimentRatio,
        fetchKm: reservoir.fetchKm,
        depthRatio: reservoir.depthRatio,
        volumeDevelopment: reservoir.volumeDevelopment,
        geom: reservoir.geom,
        createdAt: reservoir.createdAt,
        createdBy: reservoir.createdBy,
        updatedAt: reservoir.updatedAt,
        updatedBy: reservoir.updatedBy,
        version: reservoir.version,
        importBatchId: reservoir.importBatchId,
      })
      .from(reservoir)
      .where(
        and(eq(reservoir.name, name), eq(reservoir.basinId, basinId), isNull(reservoir.deletedAt)),
      )
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      geom: parseGeoJsonResult(row.geom),
    };
  }

  async list(query: ListReservoirsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(reservoir.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.basinId) {
      conditions.push(eq(reservoir.basinId, query.basinId));
    }

    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      conditions.push(ilike(reservoir.name, searchPattern));
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(reservoir)
      .where(and(...conditions));

    const rows = await client
      .select({
        id: reservoir.id,
        basinId: reservoir.basinId,
        name: reservoir.name,
        river: reservoir.river,
        areaKm2: reservoir.areaKm2,
        volumeMcm: reservoir.volumeMcm,
        meanDepthM: reservoir.meanDepthM,
        maxDepthM: reservoir.maxDepthM,
        relativeDepth: reservoir.relativeDepth,
        maxLengthKm: reservoir.maxLengthKm,
        maxWidthKm: reservoir.maxWidthKm,
        meanElevationM: reservoir.meanElevationM,
        sedimentRatio: reservoir.sedimentRatio,
        fetchKm: reservoir.fetchKm,
        depthRatio: reservoir.depthRatio,
        volumeDevelopment: reservoir.volumeDevelopment,
        geom: reservoir.geom,
        createdAt: reservoir.createdAt,
        createdBy: reservoir.createdBy,
        updatedAt: reservoir.updatedAt,
        updatedBy: reservoir.updatedBy,
        version: reservoir.version,
        importBatchId: reservoir.importBatchId,
      })
      .from(reservoir)
      .where(and(...conditions))
      .orderBy(desc(reservoir.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => ({
        ...r,
        geom: parseGeoJsonResult(r.geom),
      })),
      total: countRes?.count ?? 0,
      page,
      limit,
    };
  }

  async create(data: CreateReservoirData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const id = data.id ?? crypto.randomUUID();
    const geomSql = toGeometrySql(data.geom);

    const [created] = await client
      .insert(reservoir)
      .values({
        id,
        basinId: data.basinId,
        name: data.name,
        river: data.river ?? null,
        areaKm2: data.areaKm2 ?? null,
        volumeMcm: data.volumeMcm ?? null,
        meanDepthM: data.meanDepthM ?? null,
        maxDepthM: data.maxDepthM ?? null,
        relativeDepth: data.relativeDepth ?? null,
        maxLengthKm: data.maxLengthKm ?? null,
        maxWidthKm: data.maxWidthKm ?? null,
        meanElevationM: data.meanElevationM ?? null,
        sedimentRatio: data.sedimentRatio ?? null,
        fetchKm: data.fetchKm ?? null,
        depthRatio: data.depthRatio ?? null,
        volumeDevelopment: data.volumeDevelopment ?? null,
        geom: geomSql ? (geomSql as unknown as unknown[]) : null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
        importBatchId: data.importBatchId ?? null,
      })
      .returning();

    return this.findById(created.id, undefined, txDb);
  }

  async update(id: string, currentVersion: number, data: UpdateReservoirData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    if (data.basinId !== undefined) updateFields.basinId = data.basinId;
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.river !== undefined) updateFields.river = data.river;
    if (data.areaKm2 !== undefined) updateFields.areaKm2 = data.areaKm2;
    if (data.volumeMcm !== undefined) updateFields.volumeMcm = data.volumeMcm;
    if (data.meanDepthM !== undefined) updateFields.meanDepthM = data.meanDepthM;
    if (data.maxDepthM !== undefined) updateFields.maxDepthM = data.maxDepthM;
    if (data.relativeDepth !== undefined) updateFields.relativeDepth = data.relativeDepth;
    if (data.maxLengthKm !== undefined) updateFields.maxLengthKm = data.maxLengthKm;
    if (data.maxWidthKm !== undefined) updateFields.maxWidthKm = data.maxWidthKm;
    if (data.meanElevationM !== undefined) updateFields.meanElevationM = data.meanElevationM;
    if (data.sedimentRatio !== undefined) updateFields.sedimentRatio = data.sedimentRatio;
    if (data.fetchKm !== undefined) updateFields.fetchKm = data.fetchKm;
    if (data.depthRatio !== undefined) updateFields.depthRatio = data.depthRatio;
    if (data.volumeDevelopment !== undefined)
      updateFields.volumeDevelopment = data.volumeDevelopment;
    if (data.geom !== undefined) {
      updateFields.geom = toGeometrySql(data.geom);
    }

    const [updated] = await client
      .update(reservoir)
      .set(updateFields)
      .where(
        and(
          eq(reservoir.id, id),
          eq(reservoir.version, currentVersion),
          isNull(reservoir.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on reservoir update',
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
      .update(reservoir)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(
        and(
          eq(reservoir.id, id),
          eq(reservoir.version, expectedVersion),
          isNull(reservoir.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on reservoir delete',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    return deleted;
  }
}
