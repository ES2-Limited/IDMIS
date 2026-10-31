import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreatePlotInput,
  type ListPlotsQuery,
  type UpdatePlotInput,
} from '@idmis/contracts';
import { PlotRepository } from '../repositories/plot.repository';
import { assertInScope, deriveLocationServerSide, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class PlotService {
  constructor(private readonly plotRepo: PlotRepository) {}

  async listPlots(query: ListPlotsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    return this.plotRepo.listPlots(scope, query);
  }

  async getPlot(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    const row = await this.plotRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Plot ${id} not found`);
    }
    return row;
  }

  async createPlot(input: CreatePlotInput, authz: UserAuthz, actorUserId: string) {
    const derived = await deriveLocationServerSide({
      wardId: input.wardId,
      organisationId: input.sectorId,
    });

    await assertInScope(authz, permissions.SLIS_PLOT_MANAGE, {
      wardId: input.wardId,
      organisationId: input.sectorId,
    });

    const plotId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.plotRepo.create(
          {
            id: plotId,
            schemeId: input.schemeId,
            farmId: input.farmId ?? null,
            sectorId: input.sectorId,
            plotCode: input.plotCode,
            irrigationTypeId: input.irrigationTypeId ?? null,
            serviceType: input.serviceType ?? null,
            wardId: input.wardId ?? null,
            stateId: derived.effectiveStateId ?? null,
            geom: input.geom ?? null,
            gpsAccuracyM: input.gpsAccuracyM ?? null,
            status: (input as { status?: import('@idmis/contracts').RecordStatus }).status,
            importBatchId: (input as { importBatchId?: string | null }).importBatchId,
            submittedBy: (input as { submittedBy?: string | null }).submittedBy,
            submittedAt: (input as { submittedAt?: string | null }).submittedAt,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.plot.created',
          aggregateType: 'plot',
          aggregateId: created.id,
          payload: {
            plotId: created.id,
            plotCode: created.plotCode,
            schemeId: created.schemeId,
            stateId: created.stateId,
            createdBy: actorUserId,
          },
        });

        return created;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.plot',
          entityId: plotId,
          stateId: derived.effectiveStateId,
          after: input,
        },
      },
    );
  }

  async updatePlot(
    id: string,
    version: number,
    input: UpdatePlotInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.plotRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Plot ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_PLOT_MANAGE, {
      wardId: existing.wardId,
      organisationId: existing.sectorId,
    });

    let effectiveStateId = existing.stateId;
    if (input.wardId && input.wardId !== existing.wardId) {
      const derived = await deriveLocationServerSide({
        wardId: input.wardId,
        organisationId: existing.sectorId,
      });
      await assertInScope(authz, permissions.SLIS_PLOT_MANAGE, {
        wardId: input.wardId,
        organisationId: existing.sectorId,
      });
      effectiveStateId = derived.effectiveStateId ?? effectiveStateId;
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.plotRepo.update(
          id,
          version,
          {
            ...input,
            stateId: effectiveStateId,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: 'Plot was modified by another user. Please reload and try again.',
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.plot.updated',
          aggregateType: 'plot',
          aggregateId: updated.id,
          payload: {
            plotId: updated.id,
            plotCode: updated.plotCode,
            schemeId: updated.schemeId,
            stateId: updated.stateId,
            updatedBy: actorUserId,
          },
        });

        return updated;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.plot',
          entityId: id,
          stateId: effectiveStateId ?? undefined,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }
}
