import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  const scopeType = input.scopeType;

  if (scopeType === 'national') {
    if (input.scopeStateId || input.scopeOrgId) {
      throw new BadRequestException('National scope must not specify state or organisation');
    }
    return {
      scopeType: 'national',
      scopeStateId: null,
      scopeOrgId: null,
    };
  }

  if (scopeType === 'state') {
    if (input.scopeOrgId) {
      throw new BadRequestException('State scope must not specify organisation');
    }
    if (!input.scopeStateId) {
      throw new BadRequestException('State scope requires scopeStateId');
    }
    return {
      scopeType: 'state',
      scopeStateId: input.scopeStateId,
      scopeOrgId: null,
    };
  }

  if (scopeType === 'scheme') {
    if (!input.scopeOrgId) {
      throw new BadRequestException('Scheme scope requires scopeOrgId');
    }

    // Location (state) of a scheme-level record is ALWAYS derived server-side from core.organisation_state — never taken from the request.
    const link = await db
      .select({ stateId: organisationState.stateId })
      .from(organisationState)
      .where(eq(organisationState.organisationId, input.scopeOrgId))
      .limit(1);

    const stateId = link[0]?.stateId ?? null;
    if (!stateId) {
      throw new NotFoundException(`Scheme '${input.scopeOrgId}' not found or has no linked state`);
    }

    return {
      scopeType: 'scheme',
      scopeStateId: stateId,
      scopeOrgId: input.scopeOrgId,
    };
  }

  throw new BadRequestException(`Unsupported scopeType: ${scopeType}`);
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
