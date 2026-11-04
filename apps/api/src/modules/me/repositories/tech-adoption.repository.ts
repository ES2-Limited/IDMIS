import { Injectable } from '@nestjs/common';
import { db, techAdoption, eq, and, isNull, sql, type SQL, inArray, or, desc } from '@idmis/db';
import type { RequestScope, ListTechAdoptionsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateTechAdoptionData {
  id?: string;
  schemeId: string;
  farmerId?: string | null;
  technologyId: string;
  gender: 'female' | 'male';
  adoptedOn?: string | null;
  status?: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy: string;
}

export interface UpdateTechAdoptionData {
  schemeId?: string;
  farmerId?: string | null;
  technologyId?: string;
  gender?: 'female' | 'male';
  adoptedOn?: string | null;
  updatedBy: string;
}

@Injectable()
export class TechAdoptionRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    const scopeParts: SQL[] = [];
    if (scope.schemeIds.length > 0) {
      scopeParts.push(inArray(techAdoption.schemeId, scope.schemeIds));
    }
    if (scope.stateIds.length > 0) {
      scopeParts.push(
        sql`EXISTS (
          SELECT 1 FROM "core"."organisation_state" "os"
          WHERE "os"."organisation_id" = ${techAdoption.schemeId}
            AND "os"."state_id" IN ${scope.stateIds}
        )`,
      );
    }
    return scopeParts.length > 0 ? or(...scopeParts)! : sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(techAdoption.id, id), isNull(techAdoption.deletedAt)];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select()
      .from(techAdoption)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async list(query: ListTechAdoptionsQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(techAdoption.deletedAt)];

    if (query.schemeId) {
      conditions.push(eq(techAdoption.schemeId, query.schemeId));
    }
    if (query.technologyId) {
      conditions.push(eq(techAdoption.technologyId, query.technologyId));
    }
    if (query.gender) {
      conditions.push(eq(techAdoption.gender, query.gender));
    }

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const limit = query.limit ?? 50;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(techAdoption)
      .where(and(...conditions));

    const total = countRes?.count ?? 0;

    let itemsQuery = client
      .select()
      .from(techAdoption)
      .where(and(...conditions))
      .orderBy(desc(techAdoption.createdAt))
      .limit(limit + 1);

    if (query.cursor) {
      const cursorRow = await this.findById(query.cursor, undefined, txDb);
      if (cursorRow) {
        itemsQuery = client
          .select()
          .from(techAdoption)
          .where(and(...conditions, sql`${techAdoption.createdAt} < ${cursorRow.createdAt}`))
          .orderBy(desc(techAdoption.createdAt))
          .limit(limit + 1);
      }
    }

    const items = await itemsQuery;
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

    return {
      data,
      total,
      nextCursor,
    };
  }

  async create(data: CreateTechAdoptionData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();
    const id = data.id ?? crypto.randomUUID();

    const [created] = await client
      .insert(techAdoption)
      .values({
        id,
        schemeId: data.schemeId,
        farmerId: data.farmerId ?? null,
        technologyId: data.technologyId,
        gender: data.gender,
        adoptedOn: data.adoptedOn ?? null,
        status: data.status ?? 'submitted',
        submittedBy: data.submittedBy ?? null,
        submittedAt: data.submittedAt ?? now,
        deviceId: data.deviceId ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
      .returning();

    return created;
  }

  async update(
    id: string,
    expectedVersion: number,
    data: UpdateTechAdoptionData,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [updated] = await client
      .update(techAdoption)
      .set({
        ...(data.schemeId !== undefined && { schemeId: data.schemeId }),
        ...(data.farmerId !== undefined && { farmerId: data.farmerId }),
        ...(data.technologyId !== undefined && { technologyId: data.technologyId }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.adoptedOn !== undefined && { adoptedOn: data.adoptedOn }),
        updatedBy: data.updatedBy,
        updatedAt: now,
        version: sql`${techAdoption.version} + 1`,
      })
      .where(
        and(
          eq(techAdoption.id, id),
          eq(techAdoption.version, expectedVersion),
          isNull(techAdoption.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      if (!current) {
        return null;
      }
      throw new ConflictProblemException({
        detail: `Optimistic lock failure: TechAdoption ${id} has version ${current.version}, expected ${expectedVersion}`,
        current,
        currentVersion: current.version,
      });
    }

    return updated;
  }

  async softDelete(id: string, expectedVersion: number, deletedBy: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [deleted] = await client
      .update(techAdoption)
      .set({
        deletedAt: now,
        updatedBy: deletedBy,
        updatedAt: now,
        version: sql`${techAdoption.version} + 1`,
      })
      .where(
        and(
          eq(techAdoption.id, id),
          eq(techAdoption.version, expectedVersion),
          isNull(techAdoption.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      const current = await this.findById(id, undefined, txDb);
      if (!current) {
        return null;
      }
      throw new ConflictProblemException({
        detail: `Optimistic lock failure: TechAdoption ${id} has version ${current.version}, expected ${expectedVersion}`,
        current,
        currentVersion: current.version,
      });
    }

    return deleted;
  }
}
