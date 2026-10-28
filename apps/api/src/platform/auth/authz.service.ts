import { Injectable, Logger } from '@nestjs/common';
import {
  db,
  appUser,
  role,
  rolePermission,
  assignment,
  organisation,
  organisationState,
  eq,
  and,
  isNull,
  inArray,
  sql,
} from '@idmis/db';
import {
  permissions,
  permissionKinds,
  type Permission,
  type RequestScope,
  type CaslRule,
} from '@idmis/contracts';
import { RedisService } from '../redis/redis.service';
import type { UserAuthz } from './authz.interface';

const EMPTY_SCOPE: RequestScope = {
  isNational: false,
  stateIds: [],
  rbdaIds: [],
  schemeIds: [],
  sectorIds: [],
};

interface CachedAuthzPayload {
  userId: string;
  isSystemAdmin: boolean;
  permissions: string[];
  permissionScopes: Record<string, RequestScope>;
  rules: CaslRule[];
}

class UserAuthzImpl implements UserAuthz {
  constructor(
    public readonly userId: string,
    public readonly isSystemAdmin: boolean,
    public readonly permissions: string[],
    public readonly permissionScopes: Record<string, RequestScope>,
    public readonly rules: CaslRule[],
  ) {}

  can(permission: Permission | string): boolean {
    return permission in this.permissionScopes;
  }

  scopeFor(permission: Permission | string): RequestScope {
    return this.permissionScopes[permission] ?? { ...EMPTY_SCOPE };
  }
}

@Injectable()
export class AuthzService {
  private readonly logger = new Logger(AuthzService.name);

  constructor(private readonly redisService: RedisService) {}

  async getRbacEpoch(): Promise<number> {
    const epochStr = await this.redisService.get('auth:rbac:epoch');
    if (!epochStr) {
      await this.redisService.set('auth:rbac:epoch', '1');
      return 1;
    }
    const parsed = parseInt(epochStr, 10);
    return isNaN(parsed) ? 1 : parsed;
  }

  async incrementRbacEpoch(): Promise<number> {
    return this.redisService.incr('auth:rbac:epoch');
  }

  async invalidateUser(userId: string): Promise<void> {
    const epoch = await this.getRbacEpoch();
    const cacheKey = `auth:user:${userId}:epoch:${epoch}`;
    await this.redisService.del(cacheKey);
  }

  async getUserAuthz(userId: string): Promise<UserAuthz> {
    const epoch = await this.getRbacEpoch();
    const cacheKey = `auth:user:${userId}:epoch:${epoch}`;

    // 1. Check Redis cache
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedAuthzPayload;
        return new UserAuthzImpl(
          parsed.userId,
          parsed.isSystemAdmin,
          parsed.permissions,
          parsed.permissionScopes,
          parsed.rules,
        );
      } catch (err) {
        this.logger.warn(`Failed to parse cached authz: ${(err as Error).message}`);
      }
    }

    // 2. Compute from database
    const authz = await this.computeUserAuthz(userId);

    // 3. Store in Redis with 15-minute TTL (900 seconds)
    const payload: CachedAuthzPayload = {
      userId: authz.userId,
      isSystemAdmin: authz.isSystemAdmin,
      permissions: authz.permissions,
      permissionScopes: authz.permissionScopes,
      rules: authz.rules,
    };

    await this.redisService.set(cacheKey, JSON.stringify(payload), 900);

    return authz;
  }

  private async computeUserAuthz(userId: string): Promise<UserAuthz> {
    // 1. Fetch user active status
    const userRow = await db
      .select({
        id: appUser.id,
        isActive: appUser.isActive,
      })
      .from(appUser)
      .where(and(eq(appUser.id, userId), isNull(appUser.deletedAt)))
      .limit(1);

    if (!userRow[0] || !userRow[0].isActive) {
      return new UserAuthzImpl(userId, false, [], {}, []);
    }

    // 2. Fetch active assignments within validity dates
    const todayStr = new Date().toISOString().slice(0, 10);

    const assignments = await db
      .select({
        id: assignment.id,
        roleId: assignment.roleId,
        module: assignment.module,
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
        validFromOn: assignment.validFromOn,
        validToOn: assignment.validToOn,
        roleKey: role.key,
        roleName: role.name,
      })
      .from(assignment)
      .innerJoin(role, eq(assignment.roleId, role.id))
      .where(
        and(
          eq(assignment.userId, userId),
          isNull(assignment.deletedAt),
          sql`(${assignment.validFromOn} IS NULL OR ${assignment.validFromOn} <= ${todayStr})`,
          sql`(${assignment.validToOn} IS NULL OR ${assignment.validToOn} >= ${todayStr})`,
        ),
      );

    if (assignments.length === 0) {
      return new UserAuthzImpl(userId, false, [], {}, []);
    }

    const roleKeys = assignments.map((a) => a.roleKey);
    const isSystemAdmin = roleKeys.includes('system_admin');

    // 3. Fetch permissions for all assigned roles
    const roleIds = Array.from(new Set(assignments.map((a) => a.roleId)));
    const rolePermRows = await db
      .select({
        roleId: rolePermission.roleId,
        permission: rolePermission.permission,
      })
      .from(rolePermission)
      .where(inArray(rolePermission.roleId, roleIds));

    const rolePermissionsMap = new Map<string, Set<string>>();
    for (const row of rolePermRows) {
      if (!rolePermissionsMap.has(row.roleId)) {
        rolePermissionsMap.set(row.roleId, new Set());
      }
      rolePermissionsMap.get(row.roleId)!.add(row.permission);
    }

    // 4. Resolve downwards scope expansion for RBDA and Scheme organisations
    const rbdaOrgIds = Array.from(
      new Set(
        assignments.filter((a) => a.scopeType === 'rbda' && a.scopeOrgId).map((a) => a.scopeOrgId!),
      ),
    );

    const directSchemeOrgIds = Array.from(
      new Set(
        assignments
          .filter((a) => a.scopeType === 'scheme' && a.scopeOrgId)
          .map((a) => a.scopeOrgId!),
      ),
    );

    // Map: RBDA ID -> { stateIds, schemeIds, sectorIds }
    const rbdaExpansionMap = new Map<
      string,
      { stateIds: string[]; schemeIds: string[]; sectorIds: string[] }
    >();

    // Map: Scheme ID -> { sectorIds }
    const schemeExpansionMap = new Map<string, { sectorIds: string[] }>();

    if (rbdaOrgIds.length > 0) {
      // 4a. RBDA -> States via organisation_state
      const rbdaStates = await db
        .select({
          organisationId: organisationState.organisationId,
          stateId: organisationState.stateId,
        })
        .from(organisationState)
        .where(inArray(organisationState.organisationId, rbdaOrgIds));

      // 4b. RBDA -> child schemes
      const childSchemes = await db
        .select({
          id: organisation.id,
          parentId: organisation.parentId,
        })
        .from(organisation)
        .where(
          and(
            inArray(organisation.parentId, rbdaOrgIds),
            eq(organisation.type, 'scheme'),
            isNull(organisation.deletedAt),
          ),
        );

      const allChildSchemeIds = childSchemes.map((s) => s.id);

      // 4c. Schemes under RBDA -> child sectors
      let childSectorsUnderRbda: { id: string; parentId: string | null }[] = [];
      if (allChildSchemeIds.length > 0) {
        childSectorsUnderRbda = await db
          .select({
            id: organisation.id,
            parentId: organisation.parentId,
          })
          .from(organisation)
          .where(
            and(
              inArray(organisation.parentId, allChildSchemeIds),
              eq(organisation.type, 'sector'),
              isNull(organisation.deletedAt),
            ),
          );
      }

      for (const rId of rbdaOrgIds) {
        const states = rbdaStates.filter((s) => s.organisationId === rId).map((s) => s.stateId);
        const schemes = childSchemes.filter((s) => s.parentId === rId).map((s) => s.id);
        const schemeSet = new Set(schemes);
        const sectors = childSectorsUnderRbda
          .filter((sec) => sec.parentId && schemeSet.has(sec.parentId))
          .map((sec) => sec.id);

        rbdaExpansionMap.set(rId, {
          stateIds: states,
          schemeIds: schemes,
          sectorIds: sectors,
        });
      }
    }

    // Direct schemes: Scheme -> child sectors
    const allSchemeIdsToExpand = Array.from(new Set([...directSchemeOrgIds]));

    if (allSchemeIdsToExpand.length > 0) {
      const childSectors = await db
        .select({
          id: organisation.id,
          parentId: organisation.parentId,
        })
        .from(organisation)
        .where(
          and(
            inArray(organisation.parentId, allSchemeIdsToExpand),
            eq(organisation.type, 'sector'),
            isNull(organisation.deletedAt),
          ),
        );

      for (const sId of allSchemeIdsToExpand) {
        const sectors = childSectors.filter((sec) => sec.parentId === sId).map((sec) => sec.id);
        schemeExpansionMap.set(sId, { sectorIds: sectors });
      }
    }

    // 5. Expand each assignment to its complete effective scope
    interface ExpandedAssignment {
      roleId: string;
      scope: RequestScope;
    }

    const expandedAssignments: ExpandedAssignment[] = assignments.map((a) => {
      if (a.scopeType === 'national') {
        return {
          roleId: a.roleId,
          scope: {
            isNational: true,
            stateIds: [],
            rbdaIds: [],
            schemeIds: [],
            sectorIds: [],
          },
        };
      }

      if (a.scopeType === 'state' && a.scopeStateId) {
        return {
          roleId: a.roleId,
          scope: {
            isNational: false,
            stateIds: [a.scopeStateId],
            rbdaIds: [],
            schemeIds: [],
            sectorIds: [],
          },
        };
      }

      if (a.scopeType === 'rbda' && a.scopeOrgId) {
        const exp = rbdaExpansionMap.get(a.scopeOrgId) ?? {
          stateIds: [],
          schemeIds: [],
          sectorIds: [],
        };
        return {
          roleId: a.roleId,
          scope: {
            isNational: false,
            stateIds: exp.stateIds,
            rbdaIds: [a.scopeOrgId],
            schemeIds: exp.schemeIds,
            sectorIds: exp.sectorIds,
          },
        };
      }

      if (a.scopeType === 'scheme' && a.scopeOrgId) {
        const exp = schemeExpansionMap.get(a.scopeOrgId) ?? { sectorIds: [] };
        return {
          roleId: a.roleId,
          scope: {
            isNational: false,
            stateIds: [],
            rbdaIds: [],
            schemeIds: [a.scopeOrgId],
            sectorIds: exp.sectorIds,
          },
        };
      }

      if (a.scopeType === 'sector' && a.scopeOrgId) {
        return {
          roleId: a.roleId,
          scope: {
            isNational: false,
            stateIds: [],
            rbdaIds: [],
            schemeIds: [],
            sectorIds: [a.scopeOrgId],
          },
        };
      }

      return {
        roleId: a.roleId,
        scope: { ...EMPTY_SCOPE },
      };
    });

    // 6. Compute per-permission scopes
    const allKnownPermissions = Object.values(permissions);
    const permissionScopes: Record<string, RequestScope> = {};
    const rules: CaslRule[] = [];

    for (const perm of allKnownPermissions) {
      const isGlobal = permissionKinds[perm] === 'global';

      // Find active assignments whose role grants this permission
      const qualifyingAssignments = expandedAssignments.filter((ea) => {
        const permsForRole = rolePermissionsMap.get(ea.roleId);
        return permsForRole ? permsForRole.has(perm) : false;
      });

      if (qualifyingAssignments.length === 0) {
        continue;
      }

      if (isGlobal) {
        // Global permission: counts ONLY if granted by a NATIONAL assignment
        const hasNational = qualifyingAssignments.some((qa) => qa.scope.isNational);
        if (hasNational) {
          permissionScopes[perm] = {
            isNational: true,
            stateIds: [],
            rbdaIds: [],
            schemeIds: [],
            sectorIds: [],
          };
          const parts = perm.split('.');
          const action = parts.pop() || 'manage';
          const subject = parts.join('.');
          rules.push({ action, subject });
        }
        // Non-national assignment granting global permission is intentionally ignored
      } else {
        // Scoped permission: union across qualifying assignments
        const hasNational = qualifyingAssignments.some((qa) => qa.scope.isNational);

        if (hasNational) {
          permissionScopes[perm] = {
            isNational: true,
            stateIds: [],
            rbdaIds: [],
            schemeIds: [],
            sectorIds: [],
          };
          const parts = perm.split('.');
          const action = parts.pop() || 'manage';
          const subject = parts.join('.');
          rules.push({ action, subject });
        } else {
          const stateIds = new Set<string>();
          const rbdaIds = new Set<string>();
          const schemeIds = new Set<string>();
          const sectorIds = new Set<string>();

          for (const qa of qualifyingAssignments) {
            for (const s of qa.scope.stateIds) stateIds.add(s);
            for (const r of qa.scope.rbdaIds) rbdaIds.add(r);
            for (const sc of qa.scope.schemeIds) schemeIds.add(sc);
            for (const sec of qa.scope.sectorIds) sectorIds.add(sec);
          }

          const combinedScope: RequestScope = {
            isNational: false,
            stateIds: Array.from(stateIds),
            rbdaIds: Array.from(rbdaIds),
            schemeIds: Array.from(schemeIds),
            sectorIds: Array.from(sectorIds),
          };

          permissionScopes[perm] = combinedScope;

          const parts = perm.split('.');
          const action = parts.pop() || 'manage';
          const subject = parts.join('.');
          rules.push({
            action,
            subject,
            conditions: {
              ...(combinedScope.stateIds.length > 0
                ? { stateId: { $in: combinedScope.stateIds } }
                : {}),
              ...(combinedScope.schemeIds.length > 0
                ? { schemeId: { $in: combinedScope.schemeIds } }
                : {}),
              ...(combinedScope.sectorIds.length > 0
                ? { sectorId: { $in: combinedScope.sectorIds } }
                : {}),
            },
          });
        }
      }
    }

    const grantedPermissions = Object.keys(permissionScopes);

    return new UserAuthzImpl(userId, isSystemAdmin, grantedPermissions, permissionScopes, rules);
  }
}
