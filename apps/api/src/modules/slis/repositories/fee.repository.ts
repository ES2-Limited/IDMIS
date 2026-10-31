import { Injectable } from '@nestjs/common';
import { db, feeBilling, feeCollection, eq, and, isNull, sql } from '@idmis/db';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateFeeBillingData {
  id?: string;
  schemeId: string;
  seasonId: string;
  wuaId?: string | null;
  farmerId?: string | null;
  amountNgn: string;
  dueDate: string;
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
  status?: string;
  importBatchId?: string | null;
  createdBy?: string;
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
        dueDate: data.dueDate,
        status: data.status ?? 'billed',
        importBatchId: data.importBatchId ?? null,
        createdBy: creator,
        updatedBy: creator,
        version: 1,
      })
      .returning();
    return row!;
  }

  async findBillingById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(feeBilling)
      .where(and(eq(feeBilling.id, id), isNull(feeBilling.deletedAt)))
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
        fieldReceiptRef: null,
        deviceId: null,
        status: data.status ?? 'recorded',
        importBatchId: data.importBatchId ?? null,
        createdBy: creator,
        updatedBy: creator,
        version: 1,
      })
      .returning();
    return row!;
  }

  async findCollectionById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(feeCollection)
      .where(and(eq(feeCollection.id, id), isNull(feeCollection.deletedAt)))
      .limit(1);
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
