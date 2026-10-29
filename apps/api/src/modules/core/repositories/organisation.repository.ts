import { and, eq, inArray, isNull, type SQL } from '@idmis/db';
import { db, organisation, organisationState } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type { OrgType } from '@idmis/contracts';
import { ConflictProblemException } from '../../../platform/filters';

export interface ListOrganisationsFilter {
  type?: OrgType;
  parentId?: string;
  stateId?: string;
  isActive?: boolean;
}

export interface CreateOrganisationData {
  id?: string;
  type: OrgType;
  parentId?: string | null;
  code: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  geom?: unknown;
  isActive?: boolean;
  stateIds?: string[];
  createdBy?: string;
}

export interface UpdateOrganisationData {
  type?: OrgType;
  parentId?: string | null;
  code?: string;
  name?: string;
  shortName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  geom?: unknown;
  isActive?: boolean;
  stateIds?: string[];
  updatedBy?: string;
}

@Injectable()
export class OrganisationRepository {
  async listOrganisations(filters: ListOrganisationsFilter = {}, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [isNull(organisation.deletedAt)];

    if (filters.type) {
      conditions.push(eq(organisation.type, filters.type));
    }
    if (filters.parentId !== undefined) {
      conditions.push(
        filters.parentId
          ? eq(organisation.parentId, filters.parentId)
          : isNull(organisation.parentId),
      );
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(organisation.isActive, filters.isActive));
    }

    let rows = await txDb
      .select()
      .from(organisation)
      .where(and(...conditions))
      .orderBy(organisation.name);

    if (filters.stateId) {
      const orgStates = await txDb
        .select({ orgId: organisationState.organisationId })
        .from(organisationState)
        .where(eq(organisationState.stateId, filters.stateId));
      const allowedIds = new Set(orgStates.map((s) => s.orgId));
      rows = rows.filter((r) => allowedIds.has(r.id));
    }

    // Attach stateIds
    const orgIds = rows.map((r) => r.id);
    const stateMap = new Map<string, string[]>();
    if (orgIds.length > 0) {
      const stateRows = await txDb
        .select({
          orgId: organisationState.organisationId,
          stateId: organisationState.stateId,
        })
        .from(organisationState)
        .where(inArray(organisationState.organisationId, orgIds));

      for (const row of stateRows) {
        const list = stateMap.get(row.orgId) ?? [];
        list.push(row.stateId);
        stateMap.set(row.orgId, list);
      }
    }

    return rows.map((r) => ({
      ...r,
      stateIds: stateMap.get(r.id) ?? [],
    }));
  }

  async findById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(organisation)
      .where(and(eq(organisation.id, id), isNull(organisation.deletedAt)))
      .limit(1);

    if (!row) return null;

    const stateRows = await txDb
      .select({ stateId: organisationState.stateId })
      .from(organisationState)
      .where(eq(organisationState.organisationId, id));

    return {
      ...row,
      stateIds: stateRows.map((s) => s.stateId),
    };
  }

  async create(data: CreateOrganisationData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [row] = await txDb
      .insert(organisation)
      .values({
        id: data.id ?? crypto.randomUUID(),
        type: data.type,
        parentId: data.parentId ?? null,
        code: data.code,
        name: data.name,
        shortName: data.shortName ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        geom: data.geom ?? null,
        isActive: data.isActive ?? true,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();

    if (data.stateIds && data.stateIds.length > 0) {
      await txDb.insert(organisationState).values(
        data.stateIds.map((stateId) => ({
          organisationId: row.id,
          stateId,
        })),
      );
    }

    return {
      ...row,
      stateIds: data.stateIds ?? [],
    };
  }

  async update(
    id: string,
    expectedVersion: number,
    data: UpdateOrganisationData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.parentId !== undefined) updatePayload.parentId = data.parentId;
    if (data.code !== undefined) updatePayload.code = data.code;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.shortName !== undefined) updatePayload.shortName = data.shortName;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.geom !== undefined) updatePayload.geom = data.geom;
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
    if (data.updatedBy !== undefined) updatePayload.updatedBy = data.updatedBy;

    const [updated] = await txDb
      .update(organisation)
      .set(updatePayload)
      .where(
        and(
          eq(organisation.id, id),
          eq(organisation.version, expectedVersion),
          isNull(organisation.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await txDb
        .select()
        .from(organisation)
        .where(eq(organisation.id, id))
        .limit(1);
      throw new ConflictProblemException({
        detail: 'Organisation record version mismatch or organisation not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }

    if (data.stateIds !== undefined) {
      await txDb.delete(organisationState).where(eq(organisationState.organisationId, id));
      if (data.stateIds.length > 0) {
        await txDb.insert(organisationState).values(
          data.stateIds.map((stateId) => ({
            organisationId: id,
            stateId,
          })),
        );
      }
    }

    const stateRows = await txDb
      .select({ stateId: organisationState.stateId })
      .from(organisationState)
      .where(eq(organisationState.organisationId, id));

    return {
      ...updated,
      stateIds: stateRows.map((s) => s.stateId),
    };
  }

  async softDelete(id: string, deletedBy: string, txDb: DatabaseOrTx = db) {
    const [deleted] = await txDb
      .update(organisation)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(organisation.id, id), isNull(organisation.deletedAt)))
      .returning();
    return deleted ?? null;
  }
}
