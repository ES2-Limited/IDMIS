import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateFarmInput,
  type ListFarmsQuery,
  type UpdateFarmInput,
} from '@idmis/contracts';
import { FarmRepository } from '../repositories/farm.repository';
import { assertInScope, deriveLocationServerSide, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class FarmService {
  constructor(private readonly farmRepo: FarmRepository) {}

  async listFarms(query: ListFarmsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    return this.farmRepo.listFarms(scope, query);
  }

  async getFarm(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_PLOT_READ);
    const row = await this.farmRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Farm ${id} not found`);
    }
    return row;
  }

  async createFarm(input: CreateFarmInput, authz: UserAuthz, actorUserId: string) {
    const derived = await deriveLocationServerSide({
      organisationId: input.sectorId,
    });

    await assertInScope(authz, permissions.SLIS_PLOT_MANAGE, {
      organisationId: input.sectorId,
    });

    const farmId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.farmRepo.create(
          {
            id: farmId,
            schemeId: input.schemeId,
            sectorId: input.sectorId,
            name: input.name ?? 'Farm',
            geom: input.geom ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farm.created',
          aggregateType: 'farm',
          aggregateId: created.id,
          payload: {
            farmId: created.id,
            name: created.name,
            schemeId: created.schemeId,
            sectorId: created.sectorId,
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
          entity: 'slis.farm',
          entityId: farmId,
          stateId: derived.effectiveStateId,
          after: input,
        },
      },
    );
  }

  async updateFarm(
    id: string,
    version: number,
    input: UpdateFarmInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.farmRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Farm ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_PLOT_MANAGE, {
      organisationId: existing.sectorId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.farmRepo.update(
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
            detail: 'Farm was modified by another user. Please reload and try again.',
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farm.updated',
          aggregateType: 'farm',
          aggregateId: updated.id,
          payload: {
            farmId: updated.id,
            name: updated.name,
            schemeId: updated.schemeId,
            sectorId: updated.sectorId,
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
          entity: 'slis.farm',
          entityId: id,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }
}
