import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateTrainingInput,
  type ListTrainingAttendanceQuery,
  type ListTrainingsQuery,
  type RecordTrainingAttendanceInput,
  type TrainingAttendanceResponse,
  type TrainingResponse,
  type UpdateTrainingInput,
} from '@idmis/contracts';
import { TrainingRepository } from '../repositories/training.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';
import { eq, db, farmer } from '@idmis/db';

@Injectable()
export class TrainingService {
  constructor(private readonly trainingRepo: TrainingRepository) {}

  private mapTrainingToResponse(row: Record<string, unknown>): TrainingResponse {
    let tags: string[] = [];
    if (row.topicsCovered) {
      try {
        const parsed = JSON.parse(String(row.topicsCovered));
        if (Array.isArray(parsed)) {
          tags = parsed;
        } else {
          tags = [String(row.topicsCovered)];
        }
      } catch {
        tags = String(row.topicsCovered)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    return {
      id: String(row.id),
      schemeId: String(row.schemeId),
      topic: String(row.topic),
      tags,
      heldOn: String(row.heldOn),
      venue: (row.venue as string | null) ?? null,
      importBatchId: (row.importBatchId as string | null) ?? null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      version: Number(row.version),
    };
  }

  private mapAttendanceToResponse(row: Record<string, unknown>): TrainingAttendanceResponse {
    return {
      id: String(row.id),
      trainingId: String(row.trainingId),
      farmerId: (row.farmerId as string | null) ?? null,
      staffName: (row.staffName as string | null) ?? null,
      gender: (row.gender as TrainingAttendanceResponse['gender']) ?? null,
    };
  }

  async listTrainings(query: ListTrainingsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_TRAINING_MANAGE);
    const result = await this.trainingRepo.listTrainings(scope, query);
    return {
      items: result.items.map((r) => this.mapTrainingToResponse(r)),
      nextCursor: result.nextCursor,
    };
  }

  async getTraining(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_TRAINING_MANAGE);
    const row = await this.trainingRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Training ${id} not found`);
    }
    return this.mapTrainingToResponse(row);
  }

  async createTraining(input: CreateTrainingInput, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_TRAINING_MANAGE, {
      organisationId: input.schemeId,
    });

    const trainingId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.trainingRepo.createTraining(
          {
            id: trainingId,
            schemeId: input.schemeId,
            topic: input.topic,
            tags: input.tags,
            heldOn: input.heldOn,
            venue: input.venue ?? null,
            status: (input as { status?: import('@idmis/contracts').RecordStatus }).status,
            importBatchId: (input as { importBatchId?: string | null }).importBatchId,
            submittedBy: (input as { submittedBy?: string | null }).submittedBy,
            submittedAt: (input as { submittedAt?: string | null }).submittedAt,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.training.created',
          aggregateType: 'training',
          aggregateId: created.id,
          payload: {
            trainingId: created.id,
            schemeId: created.schemeId,
            topic: created.topic,
            heldOn: created.heldOn,
            createdBy: actorUserId,
          },
        });

        return this.mapTrainingToResponse(created);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.training',
          entityId: trainingId,
          after: input,
        },
      },
    );
  }

  async updateTraining(
    id: string,
    version: number,
    input: UpdateTrainingInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_TRAINING_MANAGE);
    const existing = await this.trainingRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Training ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_TRAINING_MANAGE, {
      organisationId: existing.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.trainingRepo.updateTraining(
          id,
          version,
          {
            topic: input.topic,
            tags: input.tags,
            heldOn: input.heldOn,
            venue: input.venue,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Training ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        return this.mapTrainingToResponse(updated);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.training',
          entityId: id,
          after: input,
        },
      },
    );
  }

  async recordAttendance(
    input: RecordTrainingAttendanceInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_TRAINING_MANAGE);
    const existingTraining = await this.trainingRepo.findById(input.trainingId, scope);
    if (!existingTraining) {
      throw new NotFoundException(`Training ${input.trainingId} not found`);
    }

    await assertInScope(authz, permissions.SLIS_TRAINING_MANAGE, {
      organisationId: existingTraining.schemeId,
    });

    if (input.farmerId) {
      const [farmerRow] = await db
        .select({ id: farmer.id })
        .from(farmer)
        .where(eq(farmer.id, input.farmerId))
        .limit(1);

      if (!farmerRow) {
        throw new BadRequestException(`Farmer ${input.farmerId} not found`);
      }
    }

    const attendanceId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.trainingRepo.recordAttendance(
          {
            id: attendanceId,
            trainingId: input.trainingId,
            farmerId: input.farmerId ?? null,
            staffName: input.staffName ?? null,
            gender: input.gender ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.training.attended',
          aggregateType: 'training_attendance',
          aggregateId: created.id,
          payload: {
            attendanceId: created.id,
            trainingId: created.trainingId,
            farmerId: created.farmerId,
            staffName: created.staffName,
            createdBy: actorUserId,
          },
        });

        return this.mapAttendanceToResponse(created);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.training_attendance',
          entityId: attendanceId,
          after: input,
        },
      },
    );
  }

  async listAttendance(trainingId: string, query: ListTrainingAttendanceQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_TRAINING_MANAGE);
    const existingTraining = await this.trainingRepo.findById(trainingId, scope);
    if (!existingTraining) {
      throw new NotFoundException(`Training ${trainingId} not found`);
    }

    const result = await this.trainingRepo.listAttendance(trainingId, query);
    return {
      items: result.items.map((r) => this.mapAttendanceToResponse(r)),
      nextCursor: result.nextCursor,
    };
  }
}
