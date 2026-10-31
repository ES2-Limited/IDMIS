import { and, eq, gt, ilike, inArray, or, sql, type SQL } from '@idmis/db';
import { db, farmer, farmerIdentity, lookupValue, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListFarmersQuery, SlisGender, RecordStatus } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

export interface CreateFarmerData {
  id?: string;
  schemeId: string;
  sectorId?: string | null;
  farmerCode: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender: SlisGender;
  birthYear?: number | null;
  phone?: string | null;
  village?: string | null;
  wardId?: string | null;
  stateId?: string | null;
  householdId?: string | null;
  unitWuaId?: string | null;
  farmerGroupId?: string | null;
  maritalStatusId?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinRelation?: string | null;
  photoFileId?: string | null;
  location?: { type: 'Point'; coordinates: [number, number] } | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
}

export interface UpdateFarmerData {
  sectorId?: string | null;
  farmerCode?: string;
  firstName?: string;
  lastName?: string;
  otherNames?: string | null;
  gender?: SlisGender;
  birthYear?: number | null;
  phone?: string | null;
  village?: string | null;
  wardId?: string | null;
  stateId?: string | null;
  householdId?: string | null;
  unitWuaId?: string | null;
  farmerGroupId?: string | null;
  maritalStatusId?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinRelation?: string | null;
  photoFileId?: string | null;
  location?: { type: 'Point'; coordinates: [number, number] } | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

export interface CreateFarmerIdentityData {
  id?: string;
  farmerId: string;
  documentTypeId: string;
  numberEnc: string;
  numberHash: string;
  numberLast4: string;
  bankName?: string | null;
  documentFileId?: string | null;
  uniquePerPerson: boolean;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class FarmerRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async listFarmers(
    scope: RequestScope,
    filters: Partial<ListFarmersQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    // Tenant scope enforcement
    const scopeCondition = applyScope(scope, {
      scheme: farmer.schemeId,
      state: farmer.stateId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(farmer.schemeId, filters.schemeId));
    }
    if (filters.sectorId) {
      conditions.push(eq(farmer.sectorId, filters.sectorId));
    }
    if (filters.stateId) {
      conditions.push(eq(farmer.stateId, filters.stateId));
    }
    if (filters.wardId) {
      conditions.push(eq(farmer.wardId, filters.wardId));
    }
    if (filters.status) {
      conditions.push(eq(farmer.status, filters.status));
    }
    if (filters.gender) {
      conditions.push(eq(farmer.gender, filters.gender));
    }
    if (filters.unitWuaId) {
      conditions.push(eq(farmer.unitWuaId, filters.unitWuaId));
    }
    if (filters.farmerGroupId) {
      conditions.push(eq(farmer.farmerGroupId, filters.farmerGroupId));
    }

    if (filters.search) {
      const q = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(farmer.farmerCode, q),
          ilike(farmer.firstName, q),
          ilike(farmer.lastName, q),
          ilike(farmer.phone, q),
        )!,
      );
    }

    if (filters.cursor) {
      conditions.push(gt(farmer.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(farmer)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(farmer.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(farmer.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: farmer.schemeId,
        state: farmer.stateId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await client
      .select()
      .from(farmer)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(data: CreateFarmerData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await client
      .insert(farmer)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        status: data.status ?? 'draft',
        submittedBy: data.submittedBy ?? (data.status === 'submitted' ? creator : null),
        submittedAt:
          data.submittedAt ?? (data.status === 'submitted' ? new Date().toISOString() : null),
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
    data: UpdateFarmerData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${farmer.version} + 1`,
    };

    if (data.sectorId !== undefined) updatePayload.sectorId = data.sectorId;
    if (data.farmerCode !== undefined) updatePayload.farmerCode = data.farmerCode;
    if (data.firstName !== undefined) updatePayload.firstName = data.firstName;
    if (data.lastName !== undefined) updatePayload.lastName = data.lastName;
    if (data.otherNames !== undefined) updatePayload.otherNames = data.otherNames;
    if (data.gender !== undefined) updatePayload.gender = data.gender;
    if (data.birthYear !== undefined) updatePayload.birthYear = data.birthYear;
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.village !== undefined) updatePayload.village = data.village;
    if (data.wardId !== undefined) updatePayload.wardId = data.wardId;
    if (data.stateId !== undefined) updatePayload.stateId = data.stateId;
    if (data.householdId !== undefined) updatePayload.householdId = data.householdId;
    if (data.unitWuaId !== undefined) updatePayload.unitWuaId = data.unitWuaId;
    if (data.farmerGroupId !== undefined) updatePayload.farmerGroupId = data.farmerGroupId;
    if (data.maritalStatusId !== undefined) updatePayload.maritalStatusId = data.maritalStatusId;
    if (data.nextOfKinName !== undefined) updatePayload.nextOfKinName = data.nextOfKinName;
    if (data.nextOfKinPhone !== undefined) updatePayload.nextOfKinPhone = data.nextOfKinPhone;
    if (data.nextOfKinRelation !== undefined)
      updatePayload.nextOfKinRelation = data.nextOfKinRelation;
    if (data.photoFileId !== undefined) updatePayload.photoFileId = data.photoFileId;
    if (data.location !== undefined) updatePayload.location = data.location;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.updatedBy !== undefined && data.updatedBy !== null)
      updatePayload.updatedBy = data.updatedBy;

    const rows = await txDb
      .update(farmer)
      .set(updatePayload)
      .where(and(eq(farmer.id, id), eq(farmer.version, expectedVersion)))
      .returning();

    return rows[0] ?? null;
  }

  // --- Identity Sub-Resource ---

  async addIdentity(data: CreateFarmerIdentityData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? SYSTEM_USER_ID;
    const rows = await txDb
      .insert(farmerIdentity)
      .values({
        ...data,
        id: data.id ?? crypto.randomUUID(),
        version: 1,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();

    return rows[0]!;
  }

  async listIdentities(farmerId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select()
      .from(farmerIdentity)
      .where(eq(farmerIdentity.farmerId, farmerId))
      .orderBy(farmerIdentity.createdAt);
  }

  async findIdentityById(id: string, farmerId: string, txDb: DatabaseOrTx = db) {
    const rows = await txDb
      .select()
      .from(farmerIdentity)
      .where(and(eq(farmerIdentity.id, id), eq(farmerIdentity.farmerId, farmerId)))
      .limit(1);

    return rows[0] ?? null;
  }

  async deleteIdentity(id: string, farmerId: string, txDb: DatabaseOrTx = db) {
    const rows = await txDb
      .delete(farmerIdentity)
      .where(and(eq(farmerIdentity.id, id), eq(farmerIdentity.farmerId, farmerId)))
      .returning();

    return rows[0] ?? null;
  }

  async isDocumentTypeUniquePerPerson(
    documentTypeId: string,
    txDb: DatabaseOrTx = db,
  ): Promise<boolean> {
    const rows = await txDb
      .select({ metadata: lookupValue.metadata })
      .from(lookupValue)
      .where(eq(lookupValue.id, documentTypeId))
      .limit(1);

    if (rows.length === 0 || !rows[0]?.metadata) {
      return true;
    }

    const meta = rows[0].metadata as Record<string, unknown>;
    if (meta.unique_per_person !== undefined) {
      return Boolean(meta.unique_per_person);
    }

    return true;
  }

  // --- Duplicate Detection Query ---

  async findDuplicateCandidates(
    params: {
      firstName: string;
      lastName: string;
      phone?: string;
      wardId?: string;
      identityHashes?: string[];
      documentTypeId?: string;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const results: Array<{
      id: string;
      farmerCode: string;
      firstName: string;
      lastName: string;
      village: string | null;
      wardId: string | null;
      schemeId: string;
      stateId: string | null;
    }> = [];

    // 1. Name match + (phone OR ward)
    const nameConditions: SQL[] = [
      sql`lower(${farmer.firstName}) = lower(${params.firstName.trim()})`,
      sql`lower(${farmer.lastName}) = lower(${params.lastName.trim()})`,
    ];

    const secondaryOrs: SQL[] = [];
    if (params.phone && params.phone.trim().length > 0) {
      secondaryOrs.push(eq(farmer.phone, params.phone.trim()));
    }
    if (params.wardId) {
      secondaryOrs.push(eq(farmer.wardId, params.wardId));
    }

    if (secondaryOrs.length > 0) {
      nameConditions.push(or(...secondaryOrs)!);

      const nameMatches = await txDb
        .select({
          id: farmer.id,
          farmerCode: farmer.farmerCode,
          firstName: farmer.firstName,
          lastName: farmer.lastName,
          village: farmer.village,
          wardId: farmer.wardId,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
        })
        .from(farmer)
        .where(and(...nameConditions))
        .limit(20);

      results.push(...nameMatches);
    }

    // 2. Identity hash match (if identityNumber candidates & documentTypeId provided)
    if (params.identityHashes && params.identityHashes.length > 0 && params.documentTypeId) {
      const idMatches = await txDb
        .select({
          id: farmer.id,
          farmerCode: farmer.farmerCode,
          firstName: farmer.firstName,
          lastName: farmer.lastName,
          village: farmer.village,
          wardId: farmer.wardId,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
        })
        .from(farmerIdentity)
        .innerJoin(farmer, eq(farmerIdentity.farmerId, farmer.id))
        .where(
          and(
            eq(farmerIdentity.documentTypeId, params.documentTypeId),
            inArray(farmerIdentity.numberHash, params.identityHashes),
          ),
        )
        .limit(20);

      results.push(...idMatches);
    }

    // Deduplicate by farmer id
    const seen = new Set<string>();
    const uniqueCandidates: typeof results = [];
    for (const r of results) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        uniqueCandidates.push(r);
      }
    }

    return uniqueCandidates;
  }
}
