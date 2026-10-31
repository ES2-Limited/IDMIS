import { and, eq, gt, gte, ilike, lte, sql, type SQL } from '@idmis/db';
import { db, training, trainingAttendance, SYSTEM_USER_ID } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type {
  RequestScope,
  ListTrainingsQuery,
  ListTrainingAttendanceQuery,
  RecordStatus,
  SlisGender,
} from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

export interface CreateTrainingData {
  id?: string;
  schemeId: string;
  topic: string;
  tags?: string[];
  heldOn: string;
  venue?: string | null;
  trainerName?: string | null;
  status?: RecordStatus;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string | null;
}

export interface UpdateTrainingData {
  topic?: string;
  tags?: string[];
  heldOn?: string;
  venue?: string | null;
  trainerName?: string | null;
  status?: RecordStatus;
  updatedBy?: string | null;
}

export interface RecordTrainingAttendanceData {
  id?: string;
  trainingId: string;
  farmerId?: string | null;
  staffUserId?: string | null;
  staffName?: string | null;
  gender?: SlisGender | null;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class TrainingRepository {
  async listTrainings(
    scope: RequestScope,
    filters: Partial<ListTrainingsQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [];

    const scopeCondition = applyScope(scope, {
      scheme: training.schemeId,
    });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (filters.schemeId) {
      conditions.push(eq(training.schemeId, filters.schemeId));
    }
    if (filters.fromHeldOn) {
      conditions.push(gte(training.heldOn, filters.fromHeldOn));
    }
    if (filters.toHeldOn) {
      conditions.push(lte(training.heldOn, filters.toHeldOn));
    }
    if (filters.tag) {
      conditions.push(ilike(training.topicsCovered, `%${filters.tag}%`));
    }

    if (filters.cursor) {
      conditions.push(gt(training.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(training)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(training.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(training.id, id)];
    if (scope) {
      const scopeCond = applyScope(scope, {
        scheme: training.schemeId,
      });
      if (scopeCond) conditions.push(scopeCond);
    }

    const rows = await txDb
      .select()
      .from(training)
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  async createTraining(data: CreateTrainingData, txDb: DatabaseOrTx = db) {
    const id = data.id ?? crypto.randomUUID();
    const rows = await txDb
      .insert(training)
      .values({
        id,
        schemeId: data.schemeId,
        topic: data.topic,
        heldOn: data.heldOn,
        venue: data.venue ?? null,
        trainerName: data.trainerName ?? null,
        topicsCovered: data.tags ? JSON.stringify(data.tags) : null,
        status: data.status ?? 'draft',
        deviceId: data.deviceId ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return rows[0]!;
  }

  async updateTraining(
    id: string,
    version: number,
    data: UpdateTrainingData,
    txDb: DatabaseOrTx = db,
  ) {
    const updateValues: Record<string, unknown> = {
      updatedBy: data.updatedBy ?? SYSTEM_USER_ID,
      updatedAt: new Date().toISOString(),
      version: sql`${training.version} + 1`,
    };

    if (data.topic !== undefined) {
      updateValues.topic = data.topic;
    }
    if (data.heldOn !== undefined) {
      updateValues.heldOn = data.heldOn;
    }
    if (data.venue !== undefined) {
      updateValues.venue = data.venue;
    }
    if (data.trainerName !== undefined) {
      updateValues.trainerName = data.trainerName;
    }
    if (data.tags !== undefined) {
      updateValues.topicsCovered = JSON.stringify(data.tags);
    }
    if (data.status !== undefined) {
      updateValues.status = data.status;
    }

    const rows = await txDb
      .update(training)
      .set(updateValues)
      .where(and(eq(training.id, id), eq(training.version, version)))
      .returning();

    return rows[0] ?? null;
  }

  async recordAttendance(data: RecordTrainingAttendanceData, txDb: DatabaseOrTx = db) {
    const id = data.id ?? crypto.randomUUID();
    const rows = await txDb
      .insert(trainingAttendance)
      .values({
        id,
        trainingId: data.trainingId,
        farmerId: data.farmerId ?? null,
        staffUserId: data.staffUserId ?? null,
        staffName: data.staffName ?? null,
        gender: data.gender ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return rows[0]!;
  }

  async listAttendance(
    trainingId: string,
    filters: Partial<ListTrainingAttendanceQuery> = {},
    txDb: DatabaseOrTx = db,
  ) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [eq(trainingAttendance.trainingId, trainingId)];

    if (filters.farmerId) {
      conditions.push(eq(trainingAttendance.farmerId, filters.farmerId));
    }
    if (filters.cursor) {
      conditions.push(gt(trainingAttendance.id, filters.cursor));
    }

    const rows = await txDb
      .select()
      .from(trainingAttendance)
      .where(and(...conditions))
      .orderBy(trainingAttendance.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findAttendanceById(id: string, txDb: DatabaseOrTx = db) {
    const rows = await txDb
      .select()
      .from(trainingAttendance)
      .where(eq(trainingAttendance.id, id))
      .limit(1);

    return rows[0] ?? null;
  }
}
