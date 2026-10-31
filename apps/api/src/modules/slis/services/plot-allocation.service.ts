import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreatePlotAllocationInput,
  type ListPlotAllocationsQuery,
  type UpdatePlotAllocationInput,
} from '@idmis/contracts';
import { PlotAllocationRepository } from '../repositories/plot-allocation.repository';
import { PlotRepository } from '../repositories/plot.repository';
import { FarmerRepository } from '../repositories/farmer.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class PlotAllocationService {
  constructor(
    private readonly allocationRepo: PlotAllocationRepository,
    private readonly plotRepo: PlotRepository,
    private readonly farmerRepo: FarmerRepository,
  ) {}

  async listAllocations(query: ListPlotAllocationsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    return this.allocationRepo.listAllocations(scope, query);
  }

  async getAllocation(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    const row = await this.allocationRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Plot allocation ${id} not found`);
    }
    return row;
  }

  async createAllocation(input: CreatePlotAllocationInput, authz: UserAuthz, actorUserId: string) {
    const plotRow = await this.plotRepo.findById(input.plotId);
    if (!plotRow) {
      throw new NotFoundException(`Plot ${input.plotId} not found`);
    }

    await assertInScope(authz, permissions.SLIS_ALLOCATION_MANAGE, {
      wardId: plotRow.wardId,
      organisationId: plotRow.sectorId,
    });

    const farmerRow = await this.farmerRepo.findById(input.farmerId);
    if (!farmerRow) {
      throw new NotFoundException(`Farmer ${input.farmerId} not found`);
    }

    const allocationId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.allocationRepo.create(
          {
            id: allocationId,
            plotId: input.plotId,
            farmerId: input.farmerId,
            seasonId: input.seasonId ?? null,
            tenureId: input.tenureId ?? null,
            fromOn: input.fromOn ?? null,
            toOn: input.toOn ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.allocation.created',
          aggregateType: 'plot_allocation',
          aggregateId: created.id,
          payload: {
            allocationId: created.id,
            plotId: created.plotId,
            farmerId: created.farmerId,
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
          entity: 'slis.plot_allocation',
          entityId: allocationId,
          stateId: plotRow.stateId ?? undefined,
          after: input,
        },
      },
    );
  }

  async updateAllocation(
    id: string,
    version: number,
    input: UpdatePlotAllocationInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.allocationRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Plot allocation ${id} not found`);
    }

    const plotRow = await this.plotRepo.findById(existing.plotId);
    if (!plotRow) {
      throw new NotFoundException(`Plot ${existing.plotId} not found`);
    }

    await assertInScope(authz, permissions.SLIS_ALLOCATION_MANAGE, {
      wardId: plotRow.wardId,
      organisationId: plotRow.sectorId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.allocationRepo.update(
          id,
          version,
          {
            ...input,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: 'Plot allocation was modified by another user. Please reload and try again.',
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.allocation.updated',
          aggregateType: 'plot_allocation',
          aggregateId: updated.id,
          payload: {
            allocationId: updated.id,
            plotId: updated.plotId,
            farmerId: updated.farmerId,
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
          entity: 'slis.plot_allocation',
          entityId: id,
          stateId: plotRow.stateId ?? undefined,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }

  async deallocate(id: string, version: number, authz: UserAuthz, actorUserId: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.updateAllocation(id, version, { toOn: today }, authz, actorUserId);
  }
}
