import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Permission, RequestScope } from '@idmis/contracts';
import { db, organisationState, eq } from '@idmis/db';
import type { UserAuthz } from '../../../platform/auth';

export interface MeScopeInput {
  scopeType: string;
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
}

export async function resolveMeScopeLocation(input: MeScopeInput): Promise<{
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId: string | null;
  scopeOrgId: string | null;
}> {
  let stateId = input.scopeStateId ?? null;
  const orgId = input.scopeOrgId ?? null;

  if (input.scopeType === 'scheme' && orgId && !stateId) {
    const link = await db
      .select({ stateId: organisationState.stateId })
      .from(organisationState)
      .where(eq(organisationState.organisationId, orgId))
      .limit(1);
    stateId = link[0]?.stateId ?? null;
  }

  return {
    scopeType: input.scopeType as 'national' | 'state' | 'scheme' | 'rbda' | 'sector',
    scopeStateId: input.scopeType === 'national' ? null : stateId,
    scopeOrgId: input.scopeType === 'scheme' ? orgId : null,
  };
}

export function isMeInScope(
  scope: RequestScope,
  target: { scopeType: string; scopeStateId?: string | null; scopeOrgId?: string | null },
): boolean {
  if (scope.isNational) {
    return true;
  }

  if (target.scopeType === 'national') {
    return false;
  }

  if (target.scopeType === 'state') {
    return !!target.scopeStateId && scope.stateIds.includes(target.scopeStateId);
  }

  if (target.scopeType === 'scheme') {
    const schemeMatch = !!target.scopeOrgId && scope.schemeIds.includes(target.scopeOrgId);
    const stateMatch = !!target.scopeStateId && scope.stateIds.includes(target.scopeStateId);
    return schemeMatch || stateMatch;
  }

  return false;
}

export async function assertMeScope(
  authz: UserAuthz,
  permission: Permission,
  location: MeScopeInput,
  isExisting = false,
): Promise<{
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId: string | null;
  scopeOrgId: string | null;
}> {
  const scope = authz.scopeFor(permission);

  if (!authz.can(permission)) {
    if (isExisting) {
      throw new NotFoundException('Record not found');
    }
    throw new ForbiddenException(`Missing required permission: ${permission}`);
  }

  const resolved = await resolveMeScopeLocation(location);

  if (!isMeInScope(scope, resolved)) {
    if (isExisting) {
      throw new NotFoundException('Record not found');
    }
    throw new ForbiddenException('Target scope is outside your assigned authorization scope');
  }

  return resolved;
}
