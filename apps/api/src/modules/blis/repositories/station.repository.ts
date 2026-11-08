import { Injectable } from '@nestjs/common';
import {
  db,
  station,
  basin,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  inArray,
  desc,
  ilike,
  or,
} from '@idmis/db';
import type { RequestScope, ListStationsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { validateAndBuildGeometrySql } from '../utils/geometry.helper';

export interface CreateStationData {
  id?: string;
  code: string;
  name: string;
  basinId: string;
  stationTypeId: string;
  wardId?: string | null;
  river?: string | null;
  geom: unknown;
  installedOn?: string | null;
  description?: string | null;
  isActive?: boolean;
  createdBy: string;
  importBatchId?: string | null;
}

export interface UpdateStationData {
  code?: string;
  name?: string;
  basinId?: string;
  stationTypeId?: string;
  wardId?: string | null;
  river?: string | null;
  geom?: unknown;
  installedOn?: string | null;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

@Injectable()
export class StationRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    if (scope.rbdaIds.length > 0) {
      return inArray(
        station.basinId,
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
    const conditions: SQL[] = [eq(station.id, id), isNull(station.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: station.id,
        code: station.code,
        name: station.name,
        basinId: station.basinId,
        stationTypeId: station.stationTypeId,
        wardId: station.wardId,
        river: station.river,
        geom: sql<unknown>`ST_AsGeoJSON(${station.geom})::json`,
        installedOn: station.installedOn,
        description: station.description,
        isActive: station.isActive,
        createdAt: station.createdAt,
        createdBy: station.createdBy,
        updatedAt: station.updatedAt,
        updatedBy: station.updatedBy,
        version: station.version,
        importBatchId: station.importBatchId,
      })
      .from(station)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async findByCode(code: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(station.code, code), isNull(station.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: station.id,
        code: station.code,
        name: station.name,
        basinId: station.basinId,
        stationTypeId: station.stationTypeId,
        wardId: station.wardId,
        river: station.river,
        geom: sql<unknown>`ST_AsGeoJSON(${station.geom})::json`,
        installedOn: station.installedOn,
        description: station.description,
        isActive: station.isActive,
        createdAt: station.createdAt,
        createdBy: station.createdBy,
        updatedAt: station.updatedAt,
        updatedBy: station.updatedBy,
        version: station.version,
        importBatchId: station.importBatchId,
      })
      .from(station)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async list(query: ListStationsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(station.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.basinId) {
      conditions.push(eq(station.basinId, query.basinId));
    }

    if (query.stationTypeId) {
      conditions.push(eq(station.stationTypeId, query.stationTypeId));
    }

    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(station.name, searchPattern),
          ilike(station.code, searchPattern),
          ilike(station.river, searchPattern),
        )!,
      );
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(station)
      .where(and(...conditions));

    const rows = await client
      .select({
        id: station.id,
        code: station.code,
        name: station.name,
        basinId: station.basinId,
        stationTypeId: station.stationTypeId,
        wardId: station.wardId,
        river: station.river,
        geom: sql<unknown>`ST_AsGeoJSON(${station.geom})::json`,
        installedOn: station.installedOn,
        description: station.description,
        isActive: station.isActive,
        createdAt: station.createdAt,
        createdBy: station.createdBy,
        updatedAt: station.updatedAt,
        updatedBy: station.updatedBy,
        version: station.version,
        importBatchId: station.importBatchId,
      })
      .from(station)
      .where(and(...conditions))
      .orderBy(desc(station.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      total: countRes?.count ?? 0,
      page,
      limit,
    };
  }

  async create(data: CreateStationData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const id = data.id ?? crypto.randomUUID();
    const geomSql = validateAndBuildGeometrySql(data.geom, 'Point', { isStation: true });

    const [created] = await client
      .insert(station)
      .values({
        id,
        code: data.code,
        name: data.name,
        basinId: data.basinId,
        stationTypeId: data.stationTypeId,
        wardId: data.wardId ?? null,
        river: data.river ?? null,
        geom: geomSql ? (geomSql as unknown as unknown[]) : null,
        installedOn: data.installedOn ?? null,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
        importBatchId: data.importBatchId ?? null,
      })
      .returning();

    return this.findById(created.id, undefined, txDb);
  }

  async update(id: string, currentVersion: number, data: UpdateStationData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    if (data.code !== undefined) updateFields.code = data.code;
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.basinId !== undefined) updateFields.basinId = data.basinId;
    if (data.stationTypeId !== undefined) updateFields.stationTypeId = data.stationTypeId;
    if (data.wardId !== undefined) updateFields.wardId = data.wardId;
    if (data.river !== undefined) updateFields.river = data.river;
    if (data.installedOn !== undefined) updateFields.installedOn = data.installedOn;
    if (data.description !== undefined) updateFields.description = data.description;
    if (data.isActive !== undefined) updateFields.isActive = data.isActive;
    if (data.geom !== undefined) {
      updateFields.geom = validateAndBuildGeometrySql(data.geom, 'Point', { isStation: true });
    }

    const [updated] = await client
      .update(station)
      .set(updateFields)
      .where(
        and(eq(station.id, id), eq(station.version, currentVersion), isNull(station.deletedAt)),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on station update',
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
      .update(station)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(
        and(eq(station.id, id), eq(station.version, expectedVersion), isNull(station.deletedAt)),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on station delete',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    return deleted;
  }
}
