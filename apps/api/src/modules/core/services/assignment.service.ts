import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { permissions, type CreateAssignmentInput, type ScopeType } from '@idmis/contracts';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { UserRepository } from '../repositories/user.repository';
import { RedisService } from '../../../platform/redis/redis.service';
import type { UserAuthz } from '../../../platform/auth/authz.interface';
import type { RequestScope } from '../../../platform/context';
import {
  runInTransaction,
  type TransactionClient,
} from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly assignmentRepo: AssignmentRepository,
    private readonly userRepo: UserRepository,
    private readonly redisService: RedisService,
  ) {}

  private scopeCoversTarget(
    scope: RequestScope,
    targetScopeType: ScopeType,
    targetStateId?: string | null,
    targetOrgId?: string | null,
  ): boolean {
    if (scope.isNational) {
      return true;
    }
    if (targetScopeType === 'national') {
      return false;
    }
    if (targetScopeType === 'state') {
      return !!targetStateId && scope.stateIds.includes(targetStateId);
    }
    if (targetScopeType === 'rbda') {
      return !!targetOrgId && scope.rbdaIds.includes(targetOrgId);
    }
    if (targetScopeType === 'scheme') {
      return !!targetOrgId && scope.schemeIds.includes(targetOrgId);
    }
    if (targetScopeType === 'sector') {
      return !!targetOrgId && scope.sectorIds.includes(targetOrgId);
    }
    return false;
  }

  private async invalidateUserAuthz(userId: string): Promise<void> {
    const epochRaw = await this.redisService.get('auth:rbac:epoch');
    const epoch = epochRaw ? parseInt(epochRaw, 10) : 1;
    await this.redisService.del(`auth:user:${userId}:epoch:${epoch}`);
  }

  async listUserAssignments(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return this.assignmentRepo.listByUser(userId);
  }

  async createAssignment(
    input: CreateAssignmentInput,
    assignerAuthz: UserAuthz,
    actorUserId: string,
    existingTx?: TransactionClient,
  ) {
    // 1. Nobody can create assignments for themselves (actor === target → 403)
    if (actorUserId === input.userId) {
      throw new ForbiddenException('Cannot assign roles to yourself');
    }

    // 2. Target user exists check
    const targetUser = await this.userRepo.findById(input.userId, existingTx);
    if (!targetUser) {
      throw new NotFoundException(`User ${input.userId} not found`);
    }

    // 3. Target role exists check
    const targetRole = await this.assignmentRepo.getRoleById(input.roleId, existingTx);
    if (!targetRole) {
      throw new NotFoundException(`Role ${input.roleId} not found`);
    }

    // 4. Anti-Privilege Escalation Check: Scope of assignment management
    const assignerManageScope = assignerAuthz.scopeFor(permissions.CORE_ASSIGNMENT_MANAGE);
    if (
      !this.scopeCoversTarget(
        assignerManageScope,
        input.scopeType,
        input.scopeStateId,
        input.scopeOrgId,
      )
    ) {
      throw new ForbiddenException(
        'Cannot assign in a scope outside your assignment management scope',
      );
    }

    // 5. Anti-Privilege Escalation Check applies to EVERYONE, national included:
    // For every permission in the target role, assignerAuthz.scopeFor(perm) must cover the target scope.
    // (a national scope covers anything; otherwise check state/rbda/scheme/sector containment).
    const targetPermissions = await this.assignmentRepo.getRolePermissions(
      input.roleId,
      existingTx,
    );
    for (const perm of targetPermissions) {
      const permScope = assignerAuthz.scopeFor(perm);
      if (
        !this.scopeCoversTarget(permScope, input.scopeType, input.scopeStateId, input.scopeOrgId)
      ) {
        throw new ForbiddenException(
          `Cannot assign role '${targetRole.name}': permission '${perm}' exceeds your scope or is not held by you`,
        );
      }
    }

    const executeInsert = async (tx: TransactionClient) => {
      const row = await this.assignmentRepo.create(
        {
          id: input.id,
          userId: input.userId,
          roleId: input.roleId,
          module: input.module,
          scopeType: input.scopeType,
          scopeStateId: input.scopeStateId ?? null,
          scopeOrgId: input.scopeOrgId ?? null,
          canCaptureOffline: input.canCaptureOffline ?? false,
          validFromOn: input.validFromOn ?? null,
          validToOn: input.validToOn ?? null,
          createdBy: actorUserId,
        },
        tx,
      );

      // Emit core.assignment.changed with changeType created
      await enqueueOutboxEvent(tx, {
        eventType: 'core.assignment.changed',
        aggregateType: 'assignment',
        aggregateId: row.id,
        payload: {
          userId: row.userId,
          roleId: row.roleId,
          module: row.module,
          scopeType: row.scopeType,
          changeType: 'created',
        },
      });

      return row;
    };

    let created;
    if (existingTx) {
      created = await executeInsert(existingTx);
    } else {
      created = await runInTransaction(executeInsert, {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'assign',
          entity: 'core.assignment',
          entityId: input.id,
          stateId: input.scopeStateId ?? undefined,
          after: input,
        },
      });
    }

    // 6. Invalidate target user's authz cache in Redis
    await this.invalidateUserAuthz(input.userId);

    return created;
  }

  async deleteAssignment(assignmentId: string, assignerAuthz: UserAuthz, actorUserId: string) {
    const existing = await this.assignmentRepo.findById(assignmentId);
    if (!existing) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    // 1. Nobody can delete assignments for themselves (actor === target → 403)
    if (actorUserId === existing.userId) {
      throw new ForbiddenException('Cannot remove your own assignments');
    }

    // 2. Full scope check for every scope type (not just state)
    const assignerScope = assignerAuthz.scopeFor(permissions.CORE_ASSIGNMENT_MANAGE);
    if (
      !this.scopeCoversTarget(
        assignerScope,
        existing.scopeType,
        existing.scopeStateId,
        existing.scopeOrgId,
      )
    ) {
      throw new ForbiddenException('Cannot remove an assignment outside your assigned scope');
    }

    // 3. The last active national system_admin assignment can't be removed
    const targetRole = await this.assignmentRepo.getRoleById(existing.roleId);
    if (targetRole && targetRole.key === 'system_admin' && existing.scopeType === 'national') {
      const activeSysAdminCount = await this.assignmentRepo.countActiveNationalSystemAdmins();
      if (activeSysAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot remove the last active national system administrator assignment',
        );
      }
    }

    await runInTransaction(
      async (tx) => {
        await this.assignmentRepo.softDelete(assignmentId, actorUserId, tx);

        // Emit core.assignment.changed with changeType deleted
        await enqueueOutboxEvent(tx, {
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: assignmentId,
          payload: {
            userId: existing.userId,
            roleId: existing.roleId,
            module: existing.module,
            scopeType: existing.scopeType,
            changeType: 'deleted',
          },
        });
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'deassign',
          entity: 'core.assignment',
          entityId: assignmentId,
          stateId: existing.scopeStateId ?? undefined,
          before: existing,
          after: null,
        },
      },
    );

    // Invalidate target user's authz cache
    await this.invalidateUserAuthz(existing.userId);

    return { success: true };
  }
}
