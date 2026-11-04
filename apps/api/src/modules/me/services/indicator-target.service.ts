import { Injectable, NotFoundException } from '@nestjs/common';
import { permissions } from '@idmis/contracts';
import type {
  CreateIndicatorTargetInput,
  UpdateIndicatorTargetInput,
  ListIndicatorTargetsQuery,
} from '@idmis/contracts';
import type { UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { IndicatorTargetRepository } from '../repositories/indicator-target.repository';
import { IndicatorRepository } from '../repositories/indicator.repository';
import { assertMeScope } from '../utils/assert-me-scope';

@Injectable()
export class IndicatorTargetService {
  constructor(
    private readonly targetRepo: IndicatorTargetRepository,
    private readonly indicatorRepo: IndicatorRepository,
  ) {}

  async listTargets(query: ListIndicatorTargetsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    return this.targetRepo.listTargets(scope, query);
  }

  async getTarget(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    const target = await this.targetRepo.findById(id, scope);
    if (!target) {
      throw new NotFoundException(`Target with ID '${id}' not found`);
    }
    return target;
  }

  async createTarget(
    input: CreateIndicatorTargetInput,
    authz: UserAuthz,
    actorUserId: string,
    importBatchId?: string,
  ) {
    const resolvedScope = await assertMeScope(authz, permissions.ME_TARGET_MANAGE, {
      scopeType: input.scopeType,
      scopeStateId: input.scopeStateId,
      scopeOrgId: input.scopeOrgId,
    });

    const ind = await this.indicatorRepo.findById(input.indicatorId);
    if (!ind) {
      throw new NotFoundException(`Indicator with ID '${input.indicatorId}' not found`);
    }

    const existing = await this.targetRepo.findBySlot(
      input.indicatorId,
      input.year,
      resolvedScope.scopeType,
      resolvedScope.scopeStateId,
      resolvedScope.scopeOrgId,
    );

    if (existing) {
      throw new ConflictProblemException({
        detail: 'Target already exists for this slot (indicator, year, scope)',
        current: existing,
        currentVersion: existing.version,
      });
    }

    return runInTransaction(
      async (tx) => {
        const created = await this.targetRepo.create(
          {
            indicatorId: input.indicatorId,
            year: input.year,
            scopeType: resolvedScope.scopeType,
            scopeStateId: resolvedScope.scopeStateId,
            scopeOrgId: resolvedScope.scopeOrgId,
            value: input.value,
            importBatchId: importBatchId ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        return created;
      },
      {
        audit: {
          action: 'create',
          entity: 'me.indicator_target',
          actorUserId,
        },
      },
    );
  }

  async updateTarget(
    id: string,
    input: UpdateIndicatorTargetInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.targetRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Target with ID '${id}' not found`);
    }

    await assertMeScope(
      authz,
      permissions.ME_TARGET_MANAGE,
      {
        scopeType: existing.scopeType,
        scopeStateId: existing.scopeStateId,
        scopeOrgId: existing.scopeOrgId,
      },
      true,
    );

    if (existing.version !== input.version) {
      throw new ConflictProblemException({
        detail: 'Target record version mismatch. Record was modified by another user.',
        current: existing,
        currentVersion: existing.version,
      });
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.targetRepo.update(
          id,
          input.version,
          {
            value: input.value,
            updatedBy: actorUserId,
          },
          tx,
        );
        return updated;
      },
      {
        audit: {
          action: 'update',
          entity: 'me.indicator_target',
          entityId: id,
          actorUserId,
          before: existing,
        },
      },
    );
  }

  async deleteTarget(id: string, authz: UserAuthz, actorUserId: string) {
    const existing = await this.targetRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Target with ID '${id}' not found`);
    }

    await assertMeScope(
      authz,
      permissions.ME_TARGET_MANAGE,
      {
        scopeType: existing.scopeType,
        scopeStateId: existing.scopeStateId,
        scopeOrgId: existing.scopeOrgId,
      },
      true,
    );

    return runInTransaction(
      async (tx) => {
        return this.targetRepo.softDelete(id, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.indicator_target',
          entityId: id,
          actorUserId,
          before: existing,
        },
      },
    );
  }
}
