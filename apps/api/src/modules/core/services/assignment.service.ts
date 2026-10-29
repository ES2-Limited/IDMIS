import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { permissions, type CreateAssignmentInput } from '@idmis/contracts';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { UserRepository } from '../repositories/user.repository';
import { RedisService } from '../../../platform/redis/redis.service';
import type { UserAuthz } from '../../../platform/auth/authz.interface';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly assignmentRepo: AssignmentRepository,
    private readonly userRepo: UserRepository,
    private readonly redisService: RedisService,
  ) {}

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
  ) {
    // 1. Target user exists check
    const targetUser = await this.userRepo.findById(input.userId);
    if (!targetUser) {
      throw new NotFoundException(`User ${input.userId} not found`);
    }

    // 2. Target role exists check
    const targetRole = await this.assignmentRepo.getRoleById(input.roleId);
    if (!targetRole) {
      throw new NotFoundException(`Role ${input.roleId} not found`);
    }

    // 3. Anti-Privilege Escalation Check: Scope
    const assignerScope = assignerAuthz.scopeFor(permissions.CORE_ASSIGNMENT_MANAGE);
    if (!assignerScope.isNational) {
      if (input.scopeType === 'national') {
        throw new ForbiddenException('A non-national user cannot assign national scope');
      }
      if (input.scopeType === 'state') {
        if (!input.scopeStateId || !assignerScope.stateIds.includes(input.scopeStateId)) {
          throw new ForbiddenException('Cannot assign to a state outside your assigned scope');
        }
      } else if (input.scopeType === 'scheme') {
        if (!input.scopeOrgId || !assignerScope.schemeIds.includes(input.scopeOrgId)) {
          throw new ForbiddenException('Cannot assign to a scheme outside your assigned scope');
        }
      } else if (input.scopeType === 'sector') {
        if (!input.scopeOrgId || !assignerScope.sectorIds.includes(input.scopeOrgId)) {
          throw new ForbiddenException('Cannot assign to a sector outside your assigned scope');
        }
      } else if (input.scopeType === 'rbda') {
        if (!input.scopeOrgId || !assignerScope.rbdaIds.includes(input.scopeOrgId)) {
          throw new ForbiddenException('Cannot assign to an RBDA outside your assigned scope');
        }
      }
    }

    // 4. Anti-Privilege Escalation Check: Permissions
    // An assigner CANNOT grant a role that possesses permissions the assigner does not hold
    if (!assignerScope.isNational) {
      const targetPermissions = await this.assignmentRepo.getRolePermissions(input.roleId);
      for (const perm of targetPermissions) {
        if (!assignerAuthz.permissions.includes(perm)) {
          throw new ForbiddenException(
            `Cannot assign a role that grants permission '${perm}' which exceeds your own permissions`,
          );
        }
      }
    }

    // 5. Create assignment inside transaction with audit log & outbox event
    const created = await runInTransaction(
      async (tx) => {
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

        await enqueueOutboxEvent(tx, {
          eventType: 'core.assignment.created',
          aggregateType: 'assignment',
          aggregateId: row.id,
          payload: {
            assignmentId: row.id,
            userId: row.userId,
            roleId: row.roleId,
            scopeType: row.scopeType,
            assignedBy: actorUserId,
          },
        });

        return row;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'assign',
          entity: 'core.assignment',
          entityId: input.id,
          stateId: input.scopeStateId ?? undefined,
          after: input,
        },
      },
    );

    // 6. Invalidate target user's authz cache in Redis
    await this.invalidateUserAuthz(input.userId);

    return created;
  }

  async deleteAssignment(assignmentId: string, assignerAuthz: UserAuthz, actorUserId: string) {
    const existing = await this.assignmentRepo.findById(assignmentId);
    if (!existing) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    // Scope check on assignment being removed
    const assignerScope = assignerAuthz.scopeFor(permissions.CORE_ASSIGNMENT_MANAGE);
    if (!assignerScope.isNational) {
      if (existing.scopeType === 'national') {
        throw new ForbiddenException('A non-national user cannot remove national assignments');
      }
      if (
        existing.scopeType === 'state' &&
        (!existing.scopeStateId || !assignerScope.stateIds.includes(existing.scopeStateId))
      ) {
        throw new ForbiddenException('Cannot remove an assignment outside your assigned scope');
      }
    }

    await runInTransaction(
      async (tx) => {
        await this.assignmentRepo.softDelete(assignmentId, actorUserId, tx);

        await enqueueOutboxEvent(tx, {
          eventType: 'core.assignment.deleted',
          aggregateType: 'assignment',
          aggregateId: assignmentId,
          payload: {
            assignmentId,
            userId: existing.userId,
            deletedBy: actorUserId,
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
