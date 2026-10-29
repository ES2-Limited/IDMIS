import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  permissions,
  type CreateAppUserInput,
  type ListAppUsersQuery,
  type UpdateAppUserInput,
} from '@idmis/contracts';
import { eq, session } from '@idmis/db';
import { UserRepository } from '../repositories/user.repository';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { AssignmentService } from './assignment.service';
import { RedisService } from '../../../platform/redis/redis.service';
import type { UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';

const ADMIN_PROTECTED_PERMISSIONS: string[] = [
  permissions.CORE_USER_READ,
  permissions.CORE_USER_CREATE,
  permissions.CORE_USER_UPDATE,
  permissions.CORE_USER_DEACTIVATE,
  permissions.CORE_RESET_PASSWORD,
  permissions.CORE_ASSIGNMENT_MANAGE,
  permissions.CORE_ROLE_MANAGE,
];

@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly assignmentService: AssignmentService,
    private readonly redisService: RedisService,
  ) {}

  private sanitizeUser(user: Record<string, unknown>) {
    const copy = { ...user };
    delete copy.passwordHash;
    delete copy.totpSecretEnc;
    return copy;
  }

  private async invalidateUserAuthz(userId: string): Promise<void> {
    const epochRaw = await this.redisService.get('auth:rbac:epoch');
    const epoch = epochRaw ? parseInt(epochRaw, 10) : 1;
    await this.redisService.del(`auth:user:${userId}:epoch:${epoch}`);
  }

  private async assertTargetUserInScope(
    targetUserId: string,
    permission: string,
    callerAuthz: UserAuthz,
  ) {
    const user = await this.userRepo.findById(targetUserId);
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const callerScope = callerAuthz.scopeFor(permission);
    if (callerScope.isNational) {
      return user;
    }

    // 1. National-only for users who hold admin permissions (same rule as reset-password)
    const targetPermissions = await this.assignmentRepo.getUserPermissions(targetUserId);
    const targetHasAdminPerms = targetPermissions.some((p) =>
      ADMIN_PROTECTED_PERMISSIONS.includes(p),
    );
    if (targetHasAdminPerms) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    // 2. Target user must hold an assignment strictly inside caller's scope (and no national assignments)
    const targetAssignments = await this.assignmentRepo.listActiveByUser(targetUserId);
    if (targetAssignments.length === 0) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    if (targetAssignments.some((a) => a.scopeType === 'national')) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const allInScope = targetAssignments.every((a) => {
      if (a.scopeType === 'state') {
        return !!a.scopeStateId && callerScope.stateIds.includes(a.scopeStateId);
      }
      if (a.scopeType === 'scheme') {
        return !!a.scopeOrgId && callerScope.schemeIds.includes(a.scopeOrgId);
      }
      if (a.scopeType === 'sector') {
        return !!a.scopeOrgId && callerScope.sectorIds.includes(a.scopeOrgId);
      }
      if (a.scopeType === 'rbda') {
        return !!a.scopeOrgId && callerScope.rbdaIds.includes(a.scopeOrgId);
      }
      return false;
    });

    if (!allInScope) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    return user;
  }

  async listUsers(query: ListAppUsersQuery, callerAuthz: UserAuthz) {
    const callerScope = callerAuthz.scopeFor(permissions.CORE_USER_READ);
    const result = await this.userRepo.listUsers({
      cursor: query.cursor ?? undefined,
      limit: query.limit,
      isActive: query.isActive,
      roleId: query.roleId,
      search: query.search,
    });

    if (callerScope.isNational) {
      return {
        items: result.items.map((u) => this.sanitizeUser(u as Record<string, unknown>)),
        nextCursor: result.nextCursor,
      };
    }

    // Non-national caller: filter out admin users and out-of-scope users
    const filteredItems: Array<Record<string, unknown>> = [];
    for (const u of result.items) {
      const perms = await this.assignmentRepo.getUserPermissions(u.id);
      const hasAdmin = perms.some((p) => ADMIN_PROTECTED_PERMISSIONS.includes(p));
      if (hasAdmin) continue;

      const userAssignments = await this.assignmentRepo.listActiveByUser(u.id);
      if (userAssignments.length === 0) continue;
      if (userAssignments.some((a) => a.scopeType === 'national')) continue;

      const inScope = userAssignments.every((a) => {
        if (a.scopeType === 'state')
          return !!a.scopeStateId && callerScope.stateIds.includes(a.scopeStateId);
        if (a.scopeType === 'scheme')
          return !!a.scopeOrgId && callerScope.schemeIds.includes(a.scopeOrgId);
        if (a.scopeType === 'sector')
          return !!a.scopeOrgId && callerScope.sectorIds.includes(a.scopeOrgId);
        if (a.scopeType === 'rbda')
          return !!a.scopeOrgId && callerScope.rbdaIds.includes(a.scopeOrgId);
        return false;
      });

      if (inScope) {
        filteredItems.push(this.sanitizeUser(u as Record<string, unknown>));
      }
    }

    return {
      items: filteredItems,
      nextCursor: result.nextCursor,
    };
  }

  async getUser(id: string, callerAuthz: UserAuthz) {
    const user = await this.assertTargetUserInScope(id, permissions.CORE_USER_READ, callerAuthz);
    const roles = await this.userRepo.getUserRoles(id);
    return {
      ...this.sanitizeUser(user as Record<string, unknown>),
      roles,
    };
  }

  async createUser(input: CreateAppUserInput, actorUserId: string, callerAuthz: UserAuthz) {
    const callerScope = callerAuthz.scopeFor(permissions.CORE_USER_CREATE);
    if (!callerScope.isNational && !input.firstAssignment) {
      throw new BadRequestException(
        'A non-national user creator must provide a first assignment inside their scope',
      );
    }

    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictException(`User with email ${input.email} already exists`);
    }

    const userId = input.id ?? crypto.randomUUID();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const created = await runInTransaction(
      async (tx) => {
        const userRow = await this.userRepo.create(
          {
            id: userId,
            email: input.email,
            username: input.username,
            fullName: input.fullName,
            phone: input.phone,
            passwordHash,
            isActive: input.isActive,
            mustChangePassword: true, // 5. createUser sets must_change_password = true
            createdBy: actorUserId,
          },
          tx,
        );

        if (input.firstAssignment) {
          await this.assignmentService.createAssignment(
            {
              ...input.firstAssignment,
              userId,
            },
            callerAuthz,
            actorUserId,
            tx,
          );
        }

        return userRow;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'core.app_user',
          entityId: userId,
          after: { email: input.email, fullName: input.fullName, isActive: input.isActive },
        },
      },
    );

    return this.sanitizeUser(created as Record<string, unknown>);
  }

  async updateUser(
    id: string,
    expectedVersion: number,
    input: UpdateAppUserInput,
    actorUserId: string,
    callerAuthz: UserAuthz,
  ) {
    const existing = await this.assertTargetUserInScope(
      id,
      permissions.CORE_USER_UPDATE,
      callerAuthz,
    );

    if (input.email && input.email.toLowerCase().trim() !== existing.email) {
      const emailTaken = await this.userRepo.findByEmail(input.email);
      if (emailTaken) {
        throw new ConflictException(`User with email ${input.email} already exists`);
      }
    }

    const updated = await runInTransaction(
      async (tx) => {
        return this.userRepo.update(
          id,
          expectedVersion,
          {
            ...input,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'core.app_user',
          entityId: id,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );

    return this.sanitizeUser(updated as Record<string, unknown>);
  }

  async deactivateUser(id: string, actorUserId: string, callerAuthz: UserAuthz) {
    // 1. No self-deactivation
    if (id === actorUserId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    // 2. Scope check & admin protection
    const existing = await this.assertTargetUserInScope(
      id,
      permissions.CORE_USER_DEACTIVATE,
      callerAuthz,
    );

    // 3. The last active national system_admin can't be deactivated
    const targetAssignments = await this.assignmentRepo.listActiveByUser(id);
    const hasNationalSysAdmin = targetAssignments.some(
      (a) => a.scopeType === 'national' && a.roleId, // checking national assignments
    );
    if (hasNationalSysAdmin) {
      const activeSysAdminCount = await this.assignmentRepo.countActiveNationalSystemAdmins();
      if (activeSysAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot deactivate the last active national system administrator',
        );
      }
    }

    // 4. Deactivate user and revoke all sessions in same transaction
    const deleted = await runInTransaction(
      async (tx) => {
        const user = await this.userRepo.softDelete(id, actorUserId, tx);
        // Revoke all sessions for this user
        await tx
          .update(session)
          .set({ revokedAt: new Date().toISOString() })
          .where(eq(session.userId, id));

        // Outbox event: user deactivated (in catalogue)
        await enqueueOutboxEvent(tx, {
          eventType: 'core.user.deactivated',
          aggregateType: 'user',
          aggregateId: id,
          payload: {
            userId: id,
            deactivatedBy: actorUserId,
          },
        });

        return user;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'delete',
          entity: 'core.app_user',
          entityId: id,
          before: existing,
          after: null,
        },
      },
    );

    // 5. Invalidate target user in authz cache
    await this.invalidateUserAuthz(id);

    return this.sanitizeUser(deleted as Record<string, unknown>);
  }
}
