import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateCropProductionInput,
  type CropProductionResponse,
  type ListCropProductionsQuery,
  type UpdateCropProductionInput,
} from '@idmis/contracts';
import { CropProductionRepository } from '../repositories/crop-production.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';
import { eq, db, plot } from '@idmis/db';

@Injectable()
export class CropProductionService {
  constructor(private readonly cropRepo: CropProductionRepository) {}

  private mapToResponse(row: Record<string, unknown>): CropProductionResponse {
    return {
      id: String(row.id),
      schemeId: String(row.schemeId),
      plotId: String(row.plotId),
      seasonId: String(row.seasonId),
      cropTypeId: String(row.cropTypeId),
      areaHa: String(row.areaHa),
      yieldT: row.yieldT != null ? String(row.yieldT) : null,
      status: row.status as CropProductionResponse['status'],
      submittedBy: (row.submittedBy as string | null) ?? null,
      submittedAt: (row.submittedAt as string | null) ?? null,
      approvedBy: (row.approvedBy as string | null) ?? null,
      approvedAt: (row.approvedAt as string | null) ?? null,
      returnedBy: (row.returnedBy as string | null) ?? null,
      returnedAt: (row.returnedAt as string | null) ?? null,
      returnComment: (row.returnComment as string | null) ?? null,
      deviceId: (row.deviceId as string | null) ?? null,
      importBatchId: (row.importBatchId as string | null) ?? null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      version: Number(row.version),
    };
  }

  async listCropProductions(query: ListCropProductionsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_CROP_MANAGE);
    const result = await this.cropRepo.listCropProductions(scope, query);
    return {
      items: result.items.map((r) => this.mapToResponse(r)),
      nextCursor: result.nextCursor,
    };
  }

  async getCropProduction(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_CROP_MANAGE);
    const row = await this.cropRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Crop production record ${id} not found`);
    }
    return this.mapToResponse(row);
  }

  async createCropProduction(
    input: CreateCropProductionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    await assertInScope(authz, permissions.SLIS_CROP_MANAGE, {
      organisationId: input.schemeId,
    });

    const [plotRow] = await db
      .select({ id: plot.id, schemeId: plot.schemeId })
      .from(plot)
      .where(eq(plot.id, input.plotId))
      .limit(1);

    if (!plotRow || plotRow.schemeId !== input.schemeId) {
      throw new BadRequestException(
        `Plot ${input.plotId} does not belong to scheme ${input.schemeId}`,
      );
    }

    const cropId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.cropRepo.create(
          {
            id: cropId,
            schemeId: input.schemeId,
            plotId: input.plotId,
            seasonId: input.seasonId,
            cropTypeId: input.cropTypeId,
            areaHa: input.areaHa,
            yieldT: input.yieldT ?? null,
            status: (input as { status?: import('@idmis/contracts').RecordStatus }).status,
            importBatchId: (input as { importBatchId?: string | null }).importBatchId,
            submittedBy: (input as { submittedBy?: string | null }).submittedBy,
            submittedAt: (input as { submittedAt?: string | null }).submittedAt,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.crop.recorded',
          aggregateType: 'crop_production',
          aggregateId: created.id,
          payload: {
            cropProductionId: created.id,
            schemeId: created.schemeId,
            plotId: created.plotId,
            seasonId: created.seasonId,
            cropTypeId: created.cropTypeId,
            areaHa: created.areaHa,
            yieldT: created.yieldT,
            createdBy: actorUserId,
          },
        });

        return this.mapToResponse(created);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.crop_production',
          entityId: cropId,
          after: input,
        },
      },
    );
  }

  async updateCropProduction(
    id: string,
    version: number,
    input: UpdateCropProductionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_CROP_MANAGE);
    const existing = await this.cropRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Crop production record ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_CROP_MANAGE, {
      organisationId: existing.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.cropRepo.update(
          id,
          version,
          {
            areaHa: input.areaHa,
            yieldT: input.yieldT ?? null,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Crop production ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        return this.mapToResponse(updated);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.crop_production',
          entityId: id,
          after: input,
        },
      },
    );
  }
}
