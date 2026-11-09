import { Injectable } from '@nestjs/common';
import { db, feeBilling, feeCollection, eq, and, isNull, sql, gt, type SQL } from '@idmis/db';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import type { RequestScope, ListFeeBillingsQuery, ListFeeCollectionsQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';

export interface CreateFeeBillingData {
  id?: string;
  schemeId: string;
  seasonId: string;
  wuaId?: string | null;
  farmerId?: string | null;
  amountNgn: string;
  dueDate?: string;
  status?: string;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface UpdateFeeBillingData {
  amountNgn?: string;
  dueDate?: string;
  status?: string;
  updatedBy: string;
}

export interface CreateFeeCollectionData {
  id?: string;
  schemeId: string;
  seasonId: string;
  billingId: string;
  wuaId?: string | null;
  farmerId?: string | null;
  amountNgn: string;
  paidOn: string;
  receiptNo: string;
  fieldReceiptRef?: string | null;
  deviceId?: string | null;
  status?: string;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface UpdateFeeCollectionData {
  amountNgn?: string;
  paidOn?: string;
  receiptNo?: string;
  fieldReceiptRef?: string | null;
  status?: string;
  updatedBy: string;
}

@Injectable()
export class FeeRepository {
  async createBilling(data: CreateFeeBillingData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-0000-0000-000000000000';
    const [row] = await txDb
      .insert(feeBilling)
      .values({
        id: data.id ?? crypto.randomUUID(),
        schemeId: data.schemeId,
        seasonId: data.seasonId,
        wuaId: data.wuaId ?? null,
        farmerId: data.farmerId ?? null,
        amountNgn: data.amountNgn,
        dueDate: data.dueDate ?? new Date().toISOString().split('T')[0]!,
        status: data.status ?? 'billed',
        importBatchId: data.importBatchId ?? null,
        createdBy: creator,
        updatedBy: creator,
        version: 1,
      })
      .returning();
    return row!;
  }

  async listBillings(
    scope: RequestScope,
    filters: Partial<ListFeeBillingsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(feeBilling.deletedAt)];

    const scopeCondition = applyScope(scope, {
      scheme: feeBilling.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(feeBilling.schemeId, filters.schemeId));
    }
    if (filters.seasonId) {
      conditions.push(eq(feeBilling.seasonId, filters.seasonId));
    }
    if (filters.wuaId) {
      conditions.push(eq(feeBilling.wuaId, filters.wuaId));
    }
    if (filters.farmerId) {
      conditions.push(eq(feeBilling.farmerId, filters.farmerId));
    }
    if (filters.status) {
      conditions.push(eq(feeBilling.status, filters.status));
    }
    if (filters.cursor) {
      conditions.push(gt(feeBilling.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(feeBilling)
      .where(and(...conditions))
      .orderBy(feeBilling.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findBillingById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(feeBilling.id, id), isNull(feeBilling.deletedAt)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: feeBilling.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const [row] = await txDb
      .select()
      .from(feeBilling)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async findBillingByFarmerAndSeason(farmerId: string, seasonId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(feeBilling)
      .where(
        and(
          eq(feeBilling.farmerId, farmerId),
          eq(feeBilling.seasonId, seasonId),
          isNull(feeBilling.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findBillingByWuaAndSeason(wuaId: string, seasonId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(feeBilling)
      .where(
        and(
          eq(feeBilling.wuaId, wuaId),
          eq(feeBilling.seasonId, seasonId),
          isNull(feeBilling.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateBilling(
    id: string,
    expectedVersion: number,
    data: UpdateFeeBillingData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${feeBilling.version} + 1`,
      updatedBy: data.updatedBy,
    };
    if (data.amountNgn !== undefined) updatePayload.amountNgn = data.amountNgn;
    if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [row] = await txDb
      .update(feeBilling)
      .set(updatePayload)
      .where(and(eq(feeBilling.id, id), eq(feeBilling.version, expectedVersion)))
      .returning();
    return row ?? null;
  }

  async softDeleteBilling(id: string, userId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .update(feeBilling)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: userId,
        version: sql`${feeBilling.version} + 1`,
      })
      .where(eq(feeBilling.id, id))
      .returning();
    return row ?? null;
  }

  async listCollections(
    scope: RequestScope,
    filters: Partial<ListFeeCollectionsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(feeCollection.deletedAt)];

    const scopeCondition = applyScope(scope, {
      scheme: feeCollection.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(feeCollection.schemeId, filters.schemeId));
    }
    if (filters.seasonId) {
      conditions.push(eq(feeCollection.seasonId, filters.seasonId));
    }
    if (filters.wuaId) {
      conditions.push(eq(feeCollection.wuaId, filters.wuaId));
    }
    if (filters.farmerId) {
      conditions.push(eq(feeCollection.farmerId, filters.farmerId));
    }
    if (filters.status) {
      conditions.push(eq(feeCollection.status, filters.status));
    }
    if (filters.receiptNo) {
      conditions.push(eq(feeCollection.receiptNo, filters.receiptNo));
    }
    if (filters.fieldReceiptRef) {
      conditions.push(eq(feeCollection.fieldReceiptRef, filters.fieldReceiptRef));
    }
    if (filters.cursor) {
      conditions.push(gt(feeCollection.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(feeCollection)
      .where(and(...conditions))
      .orderBy(feeCollection.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async createCollection(data: CreateFeeCollectionData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-0000-0000-000000000000';
    const [row] = await txDb
      .insert(feeCollection)
      .values({
        id: data.id ?? crypto.randomUUID(),
        schemeId: data.schemeId,
        seasonId: data.seasonId,
        billingId: data.billingId,
        wuaId: data.wuaId ?? null,
        farmerId: data.farmerId ?? null,
        amountNgn: data.amountNgn,
        paidOn: data.paidOn,
        receiptNo: data.receiptNo,
        fieldReceiptRef: data.fieldReceiptRef ?? null,
        deviceId: data.deviceId ?? null,
        status: data.status ?? 'recorded',
        importBatchId: data.importBatchId ?? null,
        createdBy: creator,
        updatedBy: creator,
        version: 1,
      })
      .returning();
    return row!;
  }

  async findCollectionById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(feeCollection.id, id), isNull(feeCollection.deletedAt)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: feeCollection.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const [row] = await txDb
      .select()
      .from(feeCollection)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async updateCollection(
    id: string,
    expectedVersion: number,
    data: UpdateFeeCollectionData,
    txDb: DatabaseOrTx = db,
  ) {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      version: sql`${feeCollection.version} + 1`,
      updatedBy: data.updatedBy,
    };
    if (data.amountNgn !== undefined) updatePayload.amountNgn = data.amountNgn;
    if (data.paidOn !== undefined) updatePayload.paidOn = data.paidOn;
    if (data.receiptNo !== undefined) updatePayload.receiptNo = data.receiptNo;
    if (data.fieldReceiptRef !== undefined) updatePayload.fieldReceiptRef = data.fieldReceiptRef;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [row] = await txDb
      .update(feeCollection)
      .set(updatePayload)
      .where(and(eq(feeCollection.id, id), eq(feeCollection.version, expectedVersion)))
      .returning();
    return row ?? null;
  }

  async findCollectionByReceiptNo(receiptNo: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(feeCollection)
      .where(and(eq(feeCollection.receiptNo, receiptNo), isNull(feeCollection.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async listCollectionsByBillingId(billingId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select()
      .from(feeCollection)
      .where(and(eq(feeCollection.billingId, billingId), isNull(feeCollection.deletedAt)));
  }

  async softDeleteCollection(id: string, userId: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .update(feeCollection)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: userId,
        version: sql`${feeCollection.version} + 1`,
      })
      .where(eq(feeCollection.id, id))
      .returning();
    return row ?? null;
  }
}
