import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateHouseholdInput,
  type ListHouseholdsQuery,
  type UpdateHouseholdInput,
} from '@idmis/contracts';
import { HouseholdRepository } from '../repositories/household.repository';
import { assertInScope, deriveLocationServerSide, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class HouseholdService {
  constructor(private readonly householdRepo: HouseholdRepository) {}

  async listHouseholds(query: ListHouseholdsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_HOUSEHOLD_MANAGE);
    const result = await this.householdRepo.listHouseholds(scope, query);
    return result;
  }

  async getHousehold(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_HOUSEHOLD_MANAGE);
    const row = await this.householdRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Household ${id} not found`);
    }
    return row;
  }

  async createHousehold(input: CreateHouseholdInput, authz: UserAuthz, actorUserId: string) {
    const derived = await deriveLocationServerSide({
      wardId: input.wardId,
      organisationId: input.schemeId,
    });

    await assertInScope(authz, permissions.SLIS_HOUSEHOLD_MANAGE, {
      wardId: input.wardId,
      organisationId: input.schemeId,
    });

    const householdId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.householdRepo.create(
          {
            id: householdId,
            schemeId: input.schemeId,
            wardId: input.wardId ?? null,
            name: input.name ?? 'Household',
            settlement: input.settlement ?? null,
            size: input.size ?? null,
            males: input.males ?? null,
            females: input.females ?? null,
            children: input.children ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.household.created',
          aggregateType: 'household',
          aggregateId: created.id,
          payload: {
            householdId: created.id,
            schemeId: created.schemeId,
            stateId: derived.effectiveStateId,
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
          entity: 'slis.household',
          entityId: householdId,
          stateId: derived.effectiveStateId,
          after: input,
        },
      },
    );
  }

  async updateHousehold(
    id: string,
    version: number,
    input: UpdateHouseholdInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.householdRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Household ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_HOUSEHOLD_MANAGE, {
      wardId: existing.wardId,
      organisationId: existing.schemeId,
    });

    if (input.wardId && input.wardId !== existing.wardId) {
      await deriveLocationServerSide({
        wardId: input.wardId,
        organisationId: existing.schemeId,
      });
      await assertInScope(authz, permissions.SLIS_HOUSEHOLD_MANAGE, {
        wardId: input.wardId,
        organisationId: existing.schemeId,
      });
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.householdRepo.update(
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
            detail: 'Household was modified by another user. Please reload and try again.',
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.household.updated',
          aggregateType: 'household',
          aggregateId: updated.id,
          payload: {
            householdId: updated.id,
            schemeId: updated.schemeId,
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
          entity: 'slis.household',
          entityId: id,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }
}
