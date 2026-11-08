import { Injectable } from '@nestjs/common';
import {
  db,
  dam,
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
import type { RequestScope, ListDamsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { validateAndBuildGeometrySql } from '../utils/geometry.helper';

export interface CreateDamData {
  id?: string;
  code?: string | null;
  name: string;
  altName?: string | null;
  basinId: string;
  reservoirId?: string | null;
  secondaryOfDamId?: string | null;
  purposeId?: string | null;
  categoryId?: string | null;
  completionYear?: number | null;
  foundation?: string | null;
  heightM?: string | null;
  crestLengthM?: string | null;
  bodyVolumeMcm?: string | null;
  spillwayType?: string | null;
  spillwayCapacityM3s?: string | null;
  reservoirCapacityMcm?: string | null;
  reservoirAreaKm2?: string | null;
  reservoirLengthKm?: string | null;
  hydropowerMw?: string | null;
  meanAnnualEnergyGwh?: string | null;
  irrigatedAreaHa?: string | null;
  catchmentKm2?: string | null;
  ownerOrgId?: string | null;
  consultantOrgId?: string | null;
  contractorOrgId?: string | null;
  lgaId?: string | null;
  nearestTown?: string | null;
  resettlementNotes?: string | null;
  notes?: string | null;
  geom?: unknown;
  altitudeM?: string | null;
  createdBy: string;
  importBatchId?: string | null;
}

export interface UpdateDamData {
  code?: string | null;
  name?: string;
  altName?: string | null;
  basinId?: string;
  reservoirId?: string | null;
  secondaryOfDamId?: string | null;
  purposeId?: string | null;
  categoryId?: string | null;
  completionYear?: number | null;
  foundation?: string | null;
  heightM?: string | null;
  crestLengthM?: string | null;
  bodyVolumeMcm?: string | null;
  spillwayType?: string | null;
  spillwayCapacityM3s?: string | null;
  reservoirCapacityMcm?: string | null;
  reservoirAreaKm2?: string | null;
  reservoirLengthKm?: string | null;
  hydropowerMw?: string | null;
  meanAnnualEnergyGwh?: string | null;
  irrigatedAreaHa?: string | null;
  catchmentKm2?: string | null;
  ownerOrgId?: string | null;
  consultantOrgId?: string | null;
  contractorOrgId?: string | null;
  lgaId?: string | null;
  nearestTown?: string | null;
  resettlementNotes?: string | null;
  notes?: string | null;
  geom?: unknown;
  altitudeM?: string | null;
  updatedBy: string;
}

@Injectable()
export class DamRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    if (scope.rbdaIds.length > 0) {
      return inArray(
        dam.basinId,
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
    const conditions: SQL[] = [eq(dam.id, id), isNull(dam.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: dam.id,
        code: dam.code,
        name: dam.name,
        altName: dam.altName,
        basinId: dam.basinId,
        reservoirId: dam.reservoirId,
        secondaryOfDamId: dam.secondaryOfDamId,
        purposeId: dam.purposeId,
        categoryId: dam.categoryId,
        completionYear: dam.completionYear,
        foundation: dam.foundation,
        heightM: dam.heightM,
        crestLengthM: dam.crestLengthM,
        bodyVolumeMcm: dam.bodyVolumeMcm,
        spillwayType: dam.spillwayType,
        spillwayCapacityM3s: dam.spillwayCapacityM3s,
        reservoirCapacityMcm: dam.reservoirCapacityMcm,
        reservoirAreaKm2: dam.reservoirAreaKm2,
        reservoirLengthKm: dam.reservoirLengthKm,
        hydropowerMw: dam.hydropowerMw,
        meanAnnualEnergyGwh: dam.meanAnnualEnergyGwh,
        irrigatedAreaHa: dam.irrigatedAreaHa,
        catchmentKm2: dam.catchmentKm2,
        ownerOrgId: dam.ownerOrgId,
        consultantOrgId: dam.consultantOrgId,
        contractorOrgId: dam.contractorOrgId,
        lgaId: dam.lgaId,
        nearestTown: dam.nearestTown,
        resettlementNotes: dam.resettlementNotes,
        notes: dam.notes,
        geom: sql<unknown>`ST_AsGeoJSON(${dam.geom})::json`,
        altitudeM: dam.altitudeM,
        createdAt: dam.createdAt,
        createdBy: dam.createdBy,
        updatedAt: dam.updatedAt,
        updatedBy: dam.updatedBy,
        version: dam.version,
        importBatchId: dam.importBatchId,
      })
      .from(dam)
      .where(and(...conditions))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async findByNameAndBasin(name: string, basinId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select({
        id: dam.id,
        code: dam.code,
        name: dam.name,
        altName: dam.altName,
        basinId: dam.basinId,
        reservoirId: dam.reservoirId,
        secondaryOfDamId: dam.secondaryOfDamId,
        purposeId: dam.purposeId,
        categoryId: dam.categoryId,
        completionYear: dam.completionYear,
        foundation: dam.foundation,
        heightM: dam.heightM,
        crestLengthM: dam.crestLengthM,
        bodyVolumeMcm: dam.bodyVolumeMcm,
        spillwayType: dam.spillwayType,
        spillwayCapacityM3s: dam.spillwayCapacityM3s,
        reservoirCapacityMcm: dam.reservoirCapacityMcm,
        reservoirAreaKm2: dam.reservoirAreaKm2,
        reservoirLengthKm: dam.reservoirLengthKm,
        hydropowerMw: dam.hydropowerMw,
        meanAnnualEnergyGwh: dam.meanAnnualEnergyGwh,
        irrigatedAreaHa: dam.irrigatedAreaHa,
        catchmentKm2: dam.catchmentKm2,
        ownerOrgId: dam.ownerOrgId,
        consultantOrgId: dam.consultantOrgId,
        contractorOrgId: dam.contractorOrgId,
        lgaId: dam.lgaId,
        nearestTown: dam.nearestTown,
        resettlementNotes: dam.resettlementNotes,
        notes: dam.notes,
        geom: sql<unknown>`ST_AsGeoJSON(${dam.geom})::json`,
        altitudeM: dam.altitudeM,
        createdAt: dam.createdAt,
        createdBy: dam.createdBy,
        updatedAt: dam.updatedAt,
        updatedBy: dam.updatedBy,
        version: dam.version,
        importBatchId: dam.importBatchId,
      })
      .from(dam)
      .where(and(eq(dam.name, name), eq(dam.basinId, basinId), isNull(dam.deletedAt)))
      .limit(1);

    if (!row) return null;
    return row;
  }

  async list(query: ListDamsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(dam.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.basinId) {
      conditions.push(eq(dam.basinId, query.basinId));
    }

    if (query.reservoirId) {
      conditions.push(eq(dam.reservoirId, query.reservoirId));
    }

    if (query.purposeId) {
      conditions.push(eq(dam.purposeId, query.purposeId));
    }

    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(dam.name, searchPattern),
          ilike(dam.code, searchPattern),
          ilike(dam.altName, searchPattern),
        )!,
      );
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(dam)
      .where(and(...conditions));

    const rows = await client
      .select({
        id: dam.id,
        code: dam.code,
        name: dam.name,
        altName: dam.altName,
        basinId: dam.basinId,
        reservoirId: dam.reservoirId,
        secondaryOfDamId: dam.secondaryOfDamId,
        purposeId: dam.purposeId,
        categoryId: dam.categoryId,
        completionYear: dam.completionYear,
        foundation: dam.foundation,
        heightM: dam.heightM,
        crestLengthM: dam.crestLengthM,
        bodyVolumeMcm: dam.bodyVolumeMcm,
        spillwayType: dam.spillwayType,
        spillwayCapacityM3s: dam.spillwayCapacityM3s,
        reservoirCapacityMcm: dam.reservoirCapacityMcm,
        reservoirAreaKm2: dam.reservoirAreaKm2,
        reservoirLengthKm: dam.reservoirLengthKm,
        hydropowerMw: dam.hydropowerMw,
        meanAnnualEnergyGwh: dam.meanAnnualEnergyGwh,
        irrigatedAreaHa: dam.irrigatedAreaHa,
        catchmentKm2: dam.catchmentKm2,
        ownerOrgId: dam.ownerOrgId,
        consultantOrgId: dam.consultantOrgId,
        contractorOrgId: dam.contractorOrgId,
        lgaId: dam.lgaId,
        nearestTown: dam.nearestTown,
        resettlementNotes: dam.resettlementNotes,
        notes: dam.notes,
        geom: sql<unknown>`ST_AsGeoJSON(${dam.geom})::json`,
        altitudeM: dam.altitudeM,
        createdAt: dam.createdAt,
        createdBy: dam.createdBy,
        updatedAt: dam.updatedAt,
        updatedBy: dam.updatedBy,
        version: dam.version,
        importBatchId: dam.importBatchId,
      })
      .from(dam)
      .where(and(...conditions))
      .orderBy(desc(dam.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      total: countRes?.count ?? 0,
      page,
      limit,
    };
  }

  async create(data: CreateDamData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const id = data.id ?? crypto.randomUUID();
    const geomSql = validateAndBuildGeometrySql(data.geom, 'Point');

    const [created] = await client
      .insert(dam)
      .values({
        id,
        code: data.code ?? null,
        name: data.name,
        altName: data.altName ?? null,
        basinId: data.basinId,
        reservoirId: data.reservoirId ?? null,
        secondaryOfDamId: data.secondaryOfDamId ?? null,
        purposeId: data.purposeId ?? null,
        categoryId: data.categoryId ?? null,
        completionYear: data.completionYear ?? null,
        foundation: data.foundation ?? null,
        heightM: data.heightM ?? null,
        crestLengthM: data.crestLengthM ?? null,
        bodyVolumeMcm: data.bodyVolumeMcm ?? null,
        spillwayType: data.spillwayType ?? null,
        spillwayCapacityM3s: data.spillwayCapacityM3s ?? null,
        reservoirCapacityMcm: data.reservoirCapacityMcm ?? null,
        reservoirAreaKm2: data.reservoirAreaKm2 ?? null,
        reservoirLengthKm: data.reservoirLengthKm ?? null,
        hydropowerMw: data.hydropowerMw ?? null,
        meanAnnualEnergyGwh: data.meanAnnualEnergyGwh ?? null,
        irrigatedAreaHa: data.irrigatedAreaHa ?? null,
        catchmentKm2: data.catchmentKm2 ?? null,
        ownerOrgId: data.ownerOrgId ?? null,
        consultantOrgId: data.consultantOrgId ?? null,
        contractorOrgId: data.contractorOrgId ?? null,
        lgaId: data.lgaId ?? null,
        nearestTown: data.nearestTown ?? null,
        resettlementNotes: data.resettlementNotes ?? null,
        notes: data.notes ?? null,
        geom: geomSql ? (geomSql as unknown as unknown[]) : null,
        altitudeM: data.altitudeM ?? null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
        importBatchId: data.importBatchId ?? null,
      })
      .returning();

    return this.findById(created.id, undefined, txDb);
  }

  async update(id: string, currentVersion: number, data: UpdateDamData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);

    const updateFields: Record<string, unknown> = {
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    if (data.code !== undefined) updateFields.code = data.code;
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.altName !== undefined) updateFields.altName = data.altName;
    if (data.basinId !== undefined) updateFields.basinId = data.basinId;
    if (data.reservoirId !== undefined) updateFields.reservoirId = data.reservoirId;
    if (data.secondaryOfDamId !== undefined) updateFields.secondaryOfDamId = data.secondaryOfDamId;
    if (data.purposeId !== undefined) updateFields.purposeId = data.purposeId;
    if (data.categoryId !== undefined) updateFields.categoryId = data.categoryId;
    if (data.completionYear !== undefined) updateFields.completionYear = data.completionYear;
    if (data.foundation !== undefined) updateFields.foundation = data.foundation;
    if (data.heightM !== undefined) updateFields.heightM = data.heightM;
    if (data.crestLengthM !== undefined) updateFields.crestLengthM = data.crestLengthM;
    if (data.bodyVolumeMcm !== undefined) updateFields.bodyVolumeMcm = data.bodyVolumeMcm;
    if (data.spillwayType !== undefined) updateFields.spillwayType = data.spillwayType;
    if (data.spillwayCapacityM3s !== undefined)
      updateFields.spillwayCapacityM3s = data.spillwayCapacityM3s;
    if (data.reservoirCapacityMcm !== undefined)
      updateFields.reservoirCapacityMcm = data.reservoirCapacityMcm;
    if (data.reservoirAreaKm2 !== undefined) updateFields.reservoirAreaKm2 = data.reservoirAreaKm2;
    if (data.reservoirLengthKm !== undefined)
      updateFields.reservoirLengthKm = data.reservoirLengthKm;
    if (data.hydropowerMw !== undefined) updateFields.hydropowerMw = data.hydropowerMw;
    if (data.meanAnnualEnergyGwh !== undefined)
      updateFields.meanAnnualEnergyGwh = data.meanAnnualEnergyGwh;
    if (data.irrigatedAreaHa !== undefined) updateFields.irrigatedAreaHa = data.irrigatedAreaHa;
    if (data.catchmentKm2 !== undefined) updateFields.catchmentKm2 = data.catchmentKm2;
    if (data.ownerOrgId !== undefined) updateFields.ownerOrgId = data.ownerOrgId;
    if (data.consultantOrgId !== undefined) updateFields.consultantOrgId = data.consultantOrgId;
    if (data.contractorOrgId !== undefined) updateFields.contractorOrgId = data.contractorOrgId;
    if (data.lgaId !== undefined) updateFields.lgaId = data.lgaId;
    if (data.nearestTown !== undefined) updateFields.nearestTown = data.nearestTown;
    if (data.resettlementNotes !== undefined)
      updateFields.resettlementNotes = data.resettlementNotes;
    if (data.notes !== undefined) updateFields.notes = data.notes;
    if (data.altitudeM !== undefined) updateFields.altitudeM = data.altitudeM;
    if (data.geom !== undefined) {
      updateFields.geom = validateAndBuildGeometrySql(data.geom, 'Point');
    }

    const [updated] = await client
      .update(dam)
      .set(updateFields)
      .where(and(eq(dam.id, id), eq(dam.version, currentVersion), isNull(dam.deletedAt)))
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on dam update',
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
      .update(dam)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(and(eq(dam.id, id), eq(dam.version, expectedVersion), isNull(dam.deletedAt)))
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on dam delete',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    return deleted;
  }
}
