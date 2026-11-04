import { and, desc, eq, inArray, sql, type SQL } from '@idmis/db';
import {
  db,
  farmer,
  plot,
  cropProduction,
  waterRequest,
  streamFlowReading,
  feeBilling,
  feeCollection,
  training,
  trainingAttendance,
  appUser,
} from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope, ListReviewQueueQuery, ReviewQueueItem } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export type ReviewableEntity =
  | 'farmer'
  | 'plot'
  | 'crop_production'
  | 'water_request'
  | 'stream_flow_reading'
  | 'fee_billing'
  | 'fee_collection'
  | 'training'
  | 'training_attendance';

export interface ReviewEntityRecord {
  id: string;
  schemeId: string;
  stateId?: string | null;
  status: string;
  submittedBy?: string | null;
  version: number;
  entity: ReviewableEntity;
}

@Injectable()
export class ReviewRepository {
  async findRecord(
    entity: string,
    id: string,
    scope?: RequestScope,
    txDb: DatabaseOrTx = db,
  ): Promise<ReviewEntityRecord | null> {
    if (entity === 'farmer') {
      const conditions: SQL[] = [eq(farmer.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: farmer.schemeId, state: farmer.stateId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: farmer.id,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
          status: farmer.status,
          submittedBy: farmer.submittedBy,
          version: farmer.version,
        })
        .from(farmer)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, entity: 'farmer' } : null;
    }

    if (entity === 'plot') {
      const conditions: SQL[] = [eq(plot.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: plot.schemeId, state: plot.stateId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: plot.id,
          schemeId: plot.schemeId,
          stateId: plot.stateId,
          status: plot.status,
          submittedBy: plot.submittedBy,
          version: plot.version,
        })
        .from(plot)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, entity: 'plot' } : null;
    }

    if (entity === 'crop_production') {
      const conditions: SQL[] = [eq(cropProduction.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: cropProduction.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: cropProduction.id,
          schemeId: cropProduction.schemeId,
          status: cropProduction.status,
          submittedBy: cropProduction.submittedBy,
          version: cropProduction.version,
        })
        .from(cropProduction)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'crop_production' } : null;
    }

    if (entity === 'water_request') {
      const conditions: SQL[] = [eq(waterRequest.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: waterRequest.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: waterRequest.id,
          schemeId: waterRequest.schemeId,
          status: waterRequest.status,
          submittedBy: waterRequest.submittedBy,
          version: waterRequest.version,
        })
        .from(waterRequest)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'water_request' } : null;
    }

    if (entity === 'stream_flow_reading') {
      const conditions: SQL[] = [eq(streamFlowReading.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: streamFlowReading.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: streamFlowReading.id,
          schemeId: streamFlowReading.schemeId,
          status: streamFlowReading.status,
          submittedBy: streamFlowReading.submittedBy,
          version: streamFlowReading.version,
        })
        .from(streamFlowReading)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'stream_flow_reading' } : null;
    }

    if (entity === 'fee_billing') {
      const conditions: SQL[] = [eq(feeBilling.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: feeBilling.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: feeBilling.id,
          schemeId: feeBilling.schemeId,
          status: feeBilling.status,
          submittedBy: feeBilling.submittedBy,
          version: feeBilling.version,
        })
        .from(feeBilling)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'fee_billing' } : null;
    }

    if (entity === 'fee_collection') {
      const conditions: SQL[] = [eq(feeCollection.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: feeCollection.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: feeCollection.id,
          schemeId: feeCollection.schemeId,
          status: feeCollection.status,
          submittedBy: feeCollection.submittedBy,
          version: feeCollection.version,
        })
        .from(feeCollection)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'fee_collection' } : null;
    }

    if (entity === 'training') {
      const conditions: SQL[] = [eq(training.id, id)];
      if (scope) {
        const sc = applyScope(scope, { scheme: training.schemeId });
        if (sc) conditions.push(sc);
      }
      const [r] = await txDb
        .select({
          id: training.id,
          schemeId: training.schemeId,
          status: training.status,
          submittedBy: training.submittedBy,
          version: training.version,
        })
        .from(training)
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'training' } : null;
    }

    if (entity === 'training_attendance') {
      const conditions: SQL[] = [eq(trainingAttendance.id, id)];
      const [r] = await txDb
        .select({
          id: trainingAttendance.id,
          schemeId: training.schemeId,
          status: training.status,
          submittedBy: training.submittedBy,
          version: trainingAttendance.version,
        })
        .from(trainingAttendance)
        .innerJoin(training, eq(trainingAttendance.trainingId, training.id))
        .where(and(...conditions))
        .limit(1);
      return r ? { ...r, stateId: null, entity: 'training_attendance' } : null;
    }

    return null;
  }

  async submitRecords(
    entity: string,
    ids: string[],
    actorUserId: string,
    txDb: DatabaseOrTx = db,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const now = new Date().toISOString();

    if (entity === 'farmer') {
      const rows = await txDb
        .update(farmer)
        .set({
          status: 'submitted',
          submittedBy: actorUserId,
          submittedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${farmer.version} + 1`,
        })
        .where(inArray(farmer.id, ids))
        .returning({ id: farmer.id });
      return rows.map((r) => r.id);
    }

    if (entity === 'plot') {
      const rows = await txDb
        .update(plot)
        .set({
          status: 'submitted',
          submittedBy: actorUserId,
          submittedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${plot.version} + 1`,
        })
        .where(inArray(plot.id, ids))
        .returning({ id: plot.id });
      return rows.map((r) => r.id);
    }

    if (entity === 'crop_production') {
      const rows = await txDb
        .update(cropProduction)
        .set({
          status: 'submitted',
          submittedBy: actorUserId,
          submittedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${cropProduction.version} + 1`,
        })
        .where(inArray(cropProduction.id, ids))
        .returning({ id: cropProduction.id });
      return rows.map((r) => r.id);
    }

    if (entity === 'water_request') {
      const rows = await txDb
        .update(waterRequest)
        .set({
          status: 'submitted',
          submittedBy: actorUserId,
          submittedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${waterRequest.version} + 1`,
        })
        .where(inArray(waterRequest.id, ids))
        .returning({ id: waterRequest.id });
      return rows.map((r) => r.id);
    }

    if (entity === 'stream_flow_reading') {
      const rows = await txDb
        .update(streamFlowReading)
        .set({
          status: 'submitted',
          submittedBy: actorUserId,
          submittedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${streamFlowReading.version} + 1`,
        })
        .where(inArray(streamFlowReading.id, ids))
        .returning({ id: streamFlowReading.id });
      return rows.map((r) => r.id);
    }

    return [];
  }

  async approveRecord(
    entity: string,
    id: string,
    expectedVersion: number | undefined,
    actorUserId: string,
    txDb: DatabaseOrTx = db,
  ): Promise<ReviewEntityRecord | null> {
    const now = new Date().toISOString();

    if (entity === 'farmer') {
      const conditions: SQL[] = [eq(farmer.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(farmer.version, expectedVersion));

      const [r] = await txDb
        .update(farmer)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${farmer.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: farmer.id,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
          status: farmer.status,
          submittedBy: farmer.submittedBy,
          version: farmer.version,
        });
      return r ? { ...r, entity: 'farmer' } : null;
    }

    if (entity === 'plot') {
      const conditions: SQL[] = [eq(plot.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(plot.version, expectedVersion));

      const [r] = await txDb
        .update(plot)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${plot.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: plot.id,
          schemeId: plot.schemeId,
          stateId: plot.stateId,
          status: plot.status,
          submittedBy: plot.submittedBy,
          version: plot.version,
        });
      return r ? { ...r, entity: 'plot' } : null;
    }

    if (entity === 'crop_production') {
      const conditions: SQL[] = [eq(cropProduction.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(cropProduction.version, expectedVersion));

      const [r] = await txDb
        .update(cropProduction)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${cropProduction.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: cropProduction.id,
          schemeId: cropProduction.schemeId,
          status: cropProduction.status,
          submittedBy: cropProduction.submittedBy,
          version: cropProduction.version,
        });
      return r ? { ...r, stateId: null, entity: 'crop_production' } : null;
    }

    if (entity === 'water_request') {
      const conditions: SQL[] = [eq(waterRequest.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(waterRequest.version, expectedVersion));

      const [r] = await txDb
        .update(waterRequest)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${waterRequest.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: waterRequest.id,
          schemeId: waterRequest.schemeId,
          status: waterRequest.status,
          submittedBy: waterRequest.submittedBy,
          version: waterRequest.version,
        });
      return r ? { ...r, stateId: null, entity: 'water_request' } : null;
    }

    if (entity === 'stream_flow_reading') {
      const conditions: SQL[] = [eq(streamFlowReading.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(streamFlowReading.version, expectedVersion));

      const [r] = await txDb
        .update(streamFlowReading)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${streamFlowReading.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: streamFlowReading.id,
          schemeId: streamFlowReading.schemeId,
          status: streamFlowReading.status,
          submittedBy: streamFlowReading.submittedBy,
          version: streamFlowReading.version,
        });
      return r ? { ...r, stateId: null, entity: 'stream_flow_reading' } : null;
    }

    if (entity === 'fee_billing') {
      const conditions: SQL[] = [eq(feeBilling.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(feeBilling.version, expectedVersion));

      const [r] = await txDb
        .update(feeBilling)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${feeBilling.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: feeBilling.id,
          schemeId: feeBilling.schemeId,
          status: feeBilling.status,
          submittedBy: feeBilling.submittedBy,
          version: feeBilling.version,
        });
      return r ? { ...r, stateId: null, entity: 'fee_billing' } : null;
    }

    if (entity === 'fee_collection') {
      const conditions: SQL[] = [eq(feeCollection.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(feeCollection.version, expectedVersion));

      const [r] = await txDb
        .update(feeCollection)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${feeCollection.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: feeCollection.id,
          schemeId: feeCollection.schemeId,
          status: feeCollection.status,
          submittedBy: feeCollection.submittedBy,
          version: feeCollection.version,
        });
      return r ? { ...r, stateId: null, entity: 'fee_collection' } : null;
    }

    if (entity === 'training') {
      const conditions: SQL[] = [eq(training.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(training.version, expectedVersion));

      const [r] = await txDb
        .update(training)
        .set({
          status: 'approved',
          approvedBy: actorUserId,
          approvedAt: now,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${training.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: training.id,
          schemeId: training.schemeId,
          status: training.status,
          submittedBy: training.submittedBy,
          version: training.version,
        });
      return r ? { ...r, stateId: null, entity: 'training' } : null;
    }

    return null;
  }

  async returnRecord(
    entity: string,
    id: string,
    expectedVersion: number | undefined,
    actorUserId: string,
    comment: string,
    txDb: DatabaseOrTx = db,
  ): Promise<ReviewEntityRecord | null> {
    const now = new Date().toISOString();

    if (entity === 'farmer') {
      const conditions: SQL[] = [eq(farmer.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(farmer.version, expectedVersion));

      const [r] = await txDb
        .update(farmer)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${farmer.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: farmer.id,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
          status: farmer.status,
          submittedBy: farmer.submittedBy,
          version: farmer.version,
        });
      return r ? { ...r, entity: 'farmer' } : null;
    }

    if (entity === 'plot') {
      const conditions: SQL[] = [eq(plot.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(plot.version, expectedVersion));

      const [r] = await txDb
        .update(plot)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${plot.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: plot.id,
          schemeId: plot.schemeId,
          stateId: plot.stateId,
          status: plot.status,
          submittedBy: plot.submittedBy,
          version: plot.version,
        });
      return r ? { ...r, entity: 'plot' } : null;
    }

    if (entity === 'crop_production') {
      const conditions: SQL[] = [eq(cropProduction.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(cropProduction.version, expectedVersion));

      const [r] = await txDb
        .update(cropProduction)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${cropProduction.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: cropProduction.id,
          schemeId: cropProduction.schemeId,
          status: cropProduction.status,
          submittedBy: cropProduction.submittedBy,
          version: cropProduction.version,
        });
      return r ? { ...r, stateId: null, entity: 'crop_production' } : null;
    }

    if (entity === 'water_request') {
      const conditions: SQL[] = [eq(waterRequest.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(waterRequest.version, expectedVersion));

      const [r] = await txDb
        .update(waterRequest)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${waterRequest.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: waterRequest.id,
          schemeId: waterRequest.schemeId,
          status: waterRequest.status,
          submittedBy: waterRequest.submittedBy,
          version: waterRequest.version,
        });
      return r ? { ...r, stateId: null, entity: 'water_request' } : null;
    }

    if (entity === 'stream_flow_reading') {
      const conditions: SQL[] = [eq(streamFlowReading.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(streamFlowReading.version, expectedVersion));

      const [r] = await txDb
        .update(streamFlowReading)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${streamFlowReading.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: streamFlowReading.id,
          schemeId: streamFlowReading.schemeId,
          status: streamFlowReading.status,
          submittedBy: streamFlowReading.submittedBy,
          version: streamFlowReading.version,
        });
      return r ? { ...r, stateId: null, entity: 'stream_flow_reading' } : null;
    }

    if (entity === 'fee_billing') {
      const conditions: SQL[] = [eq(feeBilling.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(feeBilling.version, expectedVersion));

      const [r] = await txDb
        .update(feeBilling)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${feeBilling.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: feeBilling.id,
          schemeId: feeBilling.schemeId,
          status: feeBilling.status,
          submittedBy: feeBilling.submittedBy,
          version: feeBilling.version,
        });
      return r ? { ...r, stateId: null, entity: 'fee_billing' } : null;
    }

    if (entity === 'fee_collection') {
      const conditions: SQL[] = [eq(feeCollection.id, id)];
      if (expectedVersion !== undefined)
        conditions.push(eq(feeCollection.version, expectedVersion));

      const [r] = await txDb
        .update(feeCollection)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${feeCollection.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: feeCollection.id,
          schemeId: feeCollection.schemeId,
          status: feeCollection.status,
          submittedBy: feeCollection.submittedBy,
          version: feeCollection.version,
        });
      return r ? { ...r, stateId: null, entity: 'fee_collection' } : null;
    }

    if (entity === 'training') {
      const conditions: SQL[] = [eq(training.id, id)];
      if (expectedVersion !== undefined) conditions.push(eq(training.version, expectedVersion));

      const [r] = await txDb
        .update(training)
        .set({
          status: 'returned',
          returnedBy: actorUserId,
          returnedAt: now,
          returnComment: comment,
          updatedBy: actorUserId,
          updatedAt: now,
          version: sql`${training.version} + 1`,
        })
        .where(and(...conditions))
        .returning({
          id: training.id,
          schemeId: training.schemeId,
          status: training.status,
          submittedBy: training.submittedBy,
          version: training.version,
        });
      return r ? { ...r, stateId: null, entity: 'training' } : null;
    }

    return null;
  }

  async listQueue(
    scope: RequestScope,
    filters: Partial<ListReviewQueueQuery> = {},
    txDb: DatabaseOrTx = db,
  ): Promise<{ items: ReviewQueueItem[]; nextCursor: string | null }> {
    const limit = Math.min(filters.limit ?? 50, 100);
    const targetStatus = filters.status ?? 'submitted';
    const entitiesToQuery = filters.entity
      ? [filters.entity]
      : ['farmer', 'plot', 'crop_production', 'water_request', 'stream_flow_reading'];

    const allItems: ReviewQueueItem[] = [];

    if (entitiesToQuery.includes('farmer')) {
      const conditions: SQL[] = [eq(farmer.status, targetStatus)];
      const sc = applyScope(scope, { scheme: farmer.schemeId, state: farmer.stateId });
      if (sc) conditions.push(sc);
      if (filters.schemeId) conditions.push(eq(farmer.schemeId, filters.schemeId));

      const rows = await txDb
        .select({
          id: farmer.id,
          schemeId: farmer.schemeId,
          stateId: farmer.stateId,
          status: farmer.status,
          submittedBy: farmer.submittedBy,
          submittedByName: appUser.fullName,
          submittedAt: farmer.submittedAt,
          createdAt: farmer.createdAt,
          farmerCode: farmer.farmerCode,
          firstName: farmer.firstName,
          lastName: farmer.lastName,
        })
        .from(farmer)
        .leftJoin(appUser, eq(farmer.submittedBy, appUser.id))
        .where(and(...conditions))
        .orderBy(desc(farmer.createdAt))
        .limit(limit);

      for (const row of rows) {
        allItems.push({
          id: row.id,
          entity: 'farmer',
          schemeId: row.schemeId,
          stateId: row.stateId,
          status: row.status as ReviewQueueItem['status'],
          summary: `Farmer ${row.farmerCode}: ${row.firstName} ${row.lastName}`.trim(),
          submittedBy: row.submittedBy ?? null,
          submittedByName: row.submittedByName ?? null,
          submittedAt: row.submittedAt ? String(row.submittedAt) : null,
          createdAt: String(row.createdAt),
        });
      }
    }

    if (entitiesToQuery.includes('plot')) {
      const conditions: SQL[] = [eq(plot.status, targetStatus)];
      const sc = applyScope(scope, { scheme: plot.schemeId, state: plot.stateId });
      if (sc) conditions.push(sc);
      if (filters.schemeId) conditions.push(eq(plot.schemeId, filters.schemeId));

      const rows = await txDb
        .select({
          id: plot.id,
          schemeId: plot.schemeId,
          stateId: plot.stateId,
          status: plot.status,
          submittedBy: plot.submittedBy,
          submittedByName: appUser.fullName,
          submittedAt: plot.submittedAt,
          createdAt: plot.createdAt,
          plotCode: plot.plotCode,
        })
        .from(plot)
        .leftJoin(appUser, eq(plot.submittedBy, appUser.id))
        .where(and(...conditions))
        .orderBy(desc(plot.createdAt))
        .limit(limit);

      for (const row of rows) {
        allItems.push({
          id: row.id,
          entity: 'plot',
          schemeId: row.schemeId,
          stateId: row.stateId,
          status: row.status as ReviewQueueItem['status'],
          summary: `Plot ${row.plotCode}`,
          submittedBy: row.submittedBy ?? null,
          submittedByName: row.submittedByName ?? null,
          submittedAt: row.submittedAt ? String(row.submittedAt) : null,
          createdAt: String(row.createdAt),
        });
      }
    }

    if (entitiesToQuery.includes('crop_production')) {
      const conditions: SQL[] = [eq(cropProduction.status, targetStatus)];
      const sc = applyScope(scope, { scheme: cropProduction.schemeId });
      if (sc) conditions.push(sc);
      if (filters.schemeId) conditions.push(eq(cropProduction.schemeId, filters.schemeId));

      const rows = await txDb
        .select({
          id: cropProduction.id,
          schemeId: cropProduction.schemeId,
          status: cropProduction.status,
          submittedBy: cropProduction.submittedBy,
          submittedByName: appUser.fullName,
          submittedAt: cropProduction.submittedAt,
          createdAt: cropProduction.createdAt,
          areaHa: cropProduction.areaHa,
        })
        .from(cropProduction)
        .leftJoin(appUser, eq(cropProduction.submittedBy, appUser.id))
        .where(and(...conditions))
        .orderBy(desc(cropProduction.createdAt))
        .limit(limit);

      for (const row of rows) {
        allItems.push({
          id: row.id,
          entity: 'crop_production',
          schemeId: row.schemeId,
          stateId: null,
          status: row.status as ReviewQueueItem['status'],
          summary: `Crop Production: ${row.areaHa} ha`,
          submittedBy: row.submittedBy ?? null,
          submittedByName: row.submittedByName ?? null,
          submittedAt: row.submittedAt ? String(row.submittedAt) : null,
          createdAt: String(row.createdAt),
        });
      }
    }

    if (entitiesToQuery.includes('water_request')) {
      const conditions: SQL[] = [eq(waterRequest.status, targetStatus)];
      const sc = applyScope(scope, { scheme: waterRequest.schemeId });
      if (sc) conditions.push(sc);
      if (filters.schemeId) conditions.push(eq(waterRequest.schemeId, filters.schemeId));

      const rows = await txDb
        .select({
          id: waterRequest.id,
          schemeId: waterRequest.schemeId,
          status: waterRequest.status,
          submittedBy: waterRequest.submittedBy,
          submittedByName: appUser.fullName,
          submittedAt: waterRequest.submittedAt,
          createdAt: waterRequest.createdAt,
          level: waterRequest.level,
        })
        .from(waterRequest)
        .leftJoin(appUser, eq(waterRequest.submittedBy, appUser.id))
        .where(and(...conditions))
        .orderBy(desc(waterRequest.createdAt))
        .limit(limit);

      for (const row of rows) {
        allItems.push({
          id: row.id,
          entity: 'water_request',
          schemeId: row.schemeId,
          stateId: null,
          status: row.status as ReviewQueueItem['status'],
          summary: `Water Request (${row.level})`,
          submittedBy: row.submittedBy ?? null,
          submittedByName: row.submittedByName ?? null,
          submittedAt: row.submittedAt ? String(row.submittedAt) : null,
          createdAt: String(row.createdAt),
        });
      }
    }

    if (entitiesToQuery.includes('stream_flow_reading')) {
      const conditions: SQL[] = [eq(streamFlowReading.status, targetStatus)];
      const sc = applyScope(scope, { scheme: streamFlowReading.schemeId });
      if (sc) conditions.push(sc);
      if (filters.schemeId) conditions.push(eq(streamFlowReading.schemeId, filters.schemeId));

      const rows = await txDb
        .select({
          id: streamFlowReading.id,
          schemeId: streamFlowReading.schemeId,
          status: streamFlowReading.status,
          submittedBy: streamFlowReading.submittedBy,
          submittedByName: appUser.fullName,
          submittedAt: streamFlowReading.submittedAt,
          createdAt: streamFlowReading.createdAt,
          value: streamFlowReading.value,
          unit: streamFlowReading.unit,
        })
        .from(streamFlowReading)
        .leftJoin(appUser, eq(streamFlowReading.submittedBy, appUser.id))
        .where(and(...conditions))
        .orderBy(desc(streamFlowReading.createdAt))
        .limit(limit);

      for (const row of rows) {
        allItems.push({
          id: row.id,
          entity: 'stream_flow_reading',
          schemeId: row.schemeId,
          stateId: null,
          status: row.status as ReviewQueueItem['status'],
          summary: `Stream Flow: ${row.value} ${row.unit}`,
          submittedBy: row.submittedBy ?? null,
          submittedByName: row.submittedByName ?? null,
          submittedAt: row.submittedAt ? String(row.submittedAt) : null,
          createdAt: String(row.createdAt),
        });
      }
    }

    allItems.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const items = allItems.slice(0, limit);
    const nextCursor = items.length === limit ? (items[items.length - 1]?.id ?? null) : null;

    return { items, nextCursor };
  }
}
