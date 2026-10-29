import { and, desc, eq, gt, isNull, sql, type SQL } from '@idmis/db';
import { db, wua, wuaOfficer } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type { RequestScope, WuaLevel, WuaOffice } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import { ConflictProblemException } from '../../../platform/filters';

export interface ListWuasFilter {
  cursor?: string;
  limit?: number;
  level?: WuaLevel;
  organisationId?: string;
  isOperational?: boolean;
}

export interface CreateWuaData {
  id?: string;
  level: WuaLevel;
  parentId?: string | null;
  organisationId: string;
  wardId?: string | null;
  stateId?: string | null;
  regNo?: string | null;
  name: string;
  address?: string | null;
  bankName?: string | null;
  bankAccountEnc?: Buffer | null;
  isOperational?: boolean;
  hasMaintenanceFund?: boolean;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface UpdateWuaData {
  level?: WuaLevel;
  parentId?: string | null;
  organisationId?: string;
  wardId?: string | null;
  stateId?: string | null;
  regNo?: string | null;
  name?: string;
  address?: string | null;
  bankName?: string | null;
  bankAccountEnc?: Buffer | null;
  isOperational?: boolean;
  hasMaintenanceFund?: boolean;
  updatedBy?: string;
}

export interface CreateWuaOfficerData {
  id?: string;
  wuaId: string;
  office: WuaOffice;
  fullName: string;
  phone?: string | null;
  fromOn?: string | null;
  toOn?: string | null;
  createdBy?: string;
}

@Injectable()
export class WuaRepository {
  async listWuas(scope: RequestScope, filters: ListWuasFilter = {}, txDb: DatabaseOrTx = db) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(wua.deletedAt)];

    // Apply tenant scope filter
    const scopeCondition = applyScope(scope, {
      state: wua.stateId,
      organisation: wua.organisationId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.level) {
      conditions.push(eq(wua.level, filters.level));
    }
    if (filters.organisationId) {
      conditions.push(eq(wua.organisationId, filters.organisationId));
    }
    if (filters.isOperational !== undefined) {
      conditions.push(eq(wua.isOperational, filters.isOperational));
    }
    if (filters.cursor) {
      conditions.push(gt(wua.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(wua)
      .where(and(...conditions))
      .orderBy(wua.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(wua.id, id), isNull(wua.deletedAt)];
    if (scope) {
      const scopeCondition = applyScope(scope, {
        state: wua.stateId,
        organisation: wua.organisationId,
      });
      if (scopeCondition) {
        conditions.push(scopeCondition);
      }
    }

    const [row] = await txDb
      .select()
      .from(wua)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async create(data: CreateWuaData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [row] = await txDb
      .insert(wua)
      .values({
        id: data.id ?? crypto.randomUUID(),
        level: data.level,
        parentId: data.parentId ?? null,
        organisationId: data.organisationId,
        wardId: data.wardId ?? null,
        stateId: data.stateId ?? null,
        regNo: data.regNo ?? null,
        name: data.name,
        address: data.address ?? null,
        bankName: data.bankName ?? null,
        bankAccountEnc: data.bankAccountEnc ?? null,
        isOperational: data.isOperational ?? false,
        hasMaintenanceFund: data.hasMaintenanceFund ?? false,
        importBatchId: data.importBatchId ?? null,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();
    return row;
  }

  async update(id: string, expectedVersion: number, data: UpdateWuaData, txDb: DatabaseOrTx = db) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${wua.version} + 1`,
    };
    if (data.level !== undefined) updatePayload.level = data.level;
    if (data.parentId !== undefined) updatePayload.parentId = data.parentId;
    if (data.organisationId !== undefined) updatePayload.organisationId = data.organisationId;
    if (data.wardId !== undefined) updatePayload.wardId = data.wardId;
    if (data.stateId !== undefined) updatePayload.stateId = data.stateId;
    if (data.regNo !== undefined) updatePayload.regNo = data.regNo;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.bankName !== undefined) updatePayload.bankName = data.bankName;
    if (data.bankAccountEnc !== undefined) updatePayload.bankAccountEnc = data.bankAccountEnc;
    if (data.isOperational !== undefined) updatePayload.isOperational = data.isOperational;
    if (data.hasMaintenanceFund !== undefined)
      updatePayload.hasMaintenanceFund = data.hasMaintenanceFund;
    if (data.updatedBy !== undefined) updatePayload.updatedBy = data.updatedBy;

    const [updated] = await txDb
      .update(wua)
      .set(updatePayload)
      .where(and(eq(wua.id, id), eq(wua.version, expectedVersion), isNull(wua.deletedAt)))
      .returning();

    if (!updated) {
      const existing = await txDb.select().from(wua).where(eq(wua.id, id)).limit(1);
      throw new ConflictProblemException({
        detail: 'WUA record version mismatch or WUA not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }

    return updated;
  }

  async softDelete(id: string, deletedBy: string, txDb: DatabaseOrTx = db) {
    const [deleted] = await txDb
      .update(wua)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(wua.id, id), isNull(wua.deletedAt)))
      .returning();
    return deleted ?? null;
  }

  // --- Officers ---

  async listOfficers(wuaId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select()
      .from(wuaOfficer)
      .where(and(eq(wuaOfficer.wuaId, wuaId), isNull(wuaOfficer.deletedAt)))
      .orderBy(desc(wuaOfficer.createdAt));
  }

  async createOfficer(data: CreateWuaOfficerData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [row] = await txDb
      .insert(wuaOfficer)
      .values({
        id: data.id ?? crypto.randomUUID(),
        wuaId: data.wuaId,
        office: data.office,
        fullName: data.fullName,
        phone: data.phone ?? null,
        fromOn: data.fromOn ?? null,
        toOn: data.toOn ?? null,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();
    return row;
  }

  async softDeleteOfficer(
    wuaId: string,
    officerId: string,
    deletedBy: string,
    txDb: DatabaseOrTx = db,
  ) {
    const [deleted] = await txDb
      .update(wuaOfficer)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(
        and(
          eq(wuaOfficer.id, officerId),
          eq(wuaOfficer.wuaId, wuaId),
          isNull(wuaOfficer.deletedAt),
        ),
      )
      .returning();
    return deleted ?? null;
  }
}
