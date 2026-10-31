import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateWaterRequestInput,
  type DecideWaterRequestInput,
  type ListWaterRequestsQuery,
  type WaterRequestResponse,
} from '@idmis/contracts';
import { WaterRequestRepository } from '../repositories/water-request.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';
import { and, eq, db, farmer, wua } from '@idmis/db';

@Injectable()
export class WaterRequestService {
  constructor(private readonly waterRequestRepo: WaterRequestRepository) {}

  private mapToResponse(row: Record<string, unknown>): WaterRequestResponse {
    return {
      id: String(row.id),
      schemeId: String(row.schemeId),
      level: row.level as WaterRequestResponse['level'],
      wuaId: (row.wuaId as string | null) ?? null,
      farmerId: (row.farmerId as string | null) ?? null,
      seasonId: (row.seasonId as string | null) ?? null,
      volumeM3: row.requestedVolumeM3 != null ? String(row.requestedVolumeM3) : null,
      periodFromOn: (row.periodFromOn as string | null) ?? null,
      periodToOn: (row.periodToOn as string | null) ?? null,
      decision: row.decision as WaterRequestResponse['decision'],
      status: row.status as WaterRequestResponse['status'],
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

  async listWaterRequests(query: ListWaterRequestsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_WATER_REQUEST_READ);
    const result = await this.waterRequestRepo.listWaterRequests(scope, query);
    return {
      items: result.items.map((r) => this.mapToResponse(r)),
      nextCursor: result.nextCursor,
    };
  }

  async getWaterRequest(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_WATER_REQUEST_READ);
    const row = await this.waterRequestRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Water request ${id} not found`);
    }
    return this.mapToResponse(row);
  }

  async createWaterRequest(input: CreateWaterRequestInput, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_WATER_REQUEST_CREATE, {
      organisationId: input.schemeId,
    });

    if (input.level === 'individual' && input.farmerId) {
      const [farmerRow] = await db
        .select({ id: farmer.id, sectorId: farmer.sectorId })
        .from(farmer)
        .where(eq(farmer.id, input.farmerId))
        .limit(1);

      if (!farmerRow) {
        throw new BadRequestException(`Farmer ${input.farmerId} does not exist`);
      }
    } else if (input.level !== 'individual' && input.wuaId) {
      const [wuaRow] = await db
        .select({ id: wua.id, organisationId: wua.organisationId })
        .from(wua)
        .where(and(eq(wua.id, input.wuaId), eq(wua.organisationId, input.schemeId)))
        .limit(1);

      if (!wuaRow) {
        throw new BadRequestException(
          `WUA ${input.wuaId} does not belong to scheme ${input.schemeId}`,
        );
      }
    }

    const waterRequestId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.waterRequestRepo.create(
          {
            id: waterRequestId,
            schemeId: input.schemeId,
            level: input.level,
            wuaId: input.wuaId ?? null,
            farmerId: input.farmerId ?? null,
            seasonId: input.seasonId ?? null,
            requestedVolumeM3: input.volumeM3 ?? null,
            periodFromOn: input.periodFromOn ?? null,
            periodToOn: input.periodToOn ?? null,
            status: (input as { status?: import('@idmis/contracts').RecordStatus }).status,
            importBatchId: (input as { importBatchId?: string | null }).importBatchId,
            submittedBy: (input as { submittedBy?: string | null }).submittedBy,
            submittedAt: (input as { submittedAt?: string | null }).submittedAt,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.water_request.created',
          aggregateType: 'water_request',
          aggregateId: created.id,
          payload: {
            waterRequestId: created.id,
            schemeId: created.schemeId,
            level: created.level,
            farmerId: created.farmerId,
            wuaId: created.wuaId,
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
          entity: 'slis.water_request',
          entityId: waterRequestId,
          after: input,
        },
      },
    );
  }

  async decideWaterRequest(
    id: string,
    version: number,
    input: DecideWaterRequestInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_WATER_REQUEST_DECIDE);
    const existing = await this.waterRequestRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Water request ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_WATER_REQUEST_DECIDE, {
      organisationId: existing.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.waterRequestRepo.update(
          id,
          version,
          {
            decision: input.decision,
            decidedBy: actorUserId,
            decidedAt: new Date().toISOString(),
            decisionNotes: input.comment ?? null,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Water request ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.water_request.decided',
          aggregateType: 'water_request',
          aggregateId: updated.id,
          payload: {
            waterRequestId: updated.id,
            schemeId: updated.schemeId,
            decision: updated.decision,
            decidedBy: actorUserId,
          },
        });

        return this.mapToResponse(updated);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.water_request',
          entityId: id,
          after: input,
        },
      },
    );
  }
}
