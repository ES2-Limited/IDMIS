import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { db, ward, lga, organisation, organisationState, eq } from '@idmis/db';
import type { RequestScope, Permission } from '@idmis/contracts';
import type { UserAuthz } from './authz.interface';

export interface LocationInput {
  wardId?: string | null;
  organisationId: string;
}

export interface DerivedLocation {
  wardStateId?: string;
  orgStateIds: string[];
  effectiveStateId?: string;
  schemeId?: string;
  sectorId?: string;
  organisationType: string;
}

/**
 * Resolves location details strictly server-side from referenced ward and organisation.
 * Validates that the ward's state matches the organisation's state, throwing 422 if they disagree.
 */
export async function deriveLocationServerSide(input: LocationInput): Promise<DerivedLocation> {
  let wardStateId: string | undefined;

  // 1. Derive ward's state via ward -> lga -> state
  if (input.wardId) {
    const wardRows = await db
      .select({
        stateId: lga.stateId,
      })
      .from(ward)
      .innerJoin(lga, eq(ward.lgaId, lga.id))
      .where(eq(ward.id, input.wardId))
      .limit(1);

    if (wardRows.length > 0 && wardRows[0]) {
      wardStateId = wardRows[0].stateId;
    }
  }

  // 2. Derive organisation details
  const orgRows = await db
    .select({
      id: organisation.id,
      type: organisation.type,
      parentId: organisation.parentId,
    })
    .from(organisation)
    .where(eq(organisation.id, input.organisationId))
    .limit(1);

  if (orgRows.length === 0 || !orgRows[0]) {
    throw new NotFoundException('Organisation not found');
  }

  const org = orgRows[0];

  // 3. Find organisation's state(s) from organisation_state
  let orgStateRows = await db
    .select({ stateId: organisationState.stateId })
    .from(organisationState)
    .where(eq(organisationState.organisationId, org.id));

  // If sector has no direct organisation_state rows, inherit from parent scheme
  if (orgStateRows.length === 0 && org.type === 'sector' && org.parentId) {
    orgStateRows = await db
      .select({ stateId: organisationState.stateId })
      .from(organisationState)
      .where(eq(organisationState.organisationId, org.parentId));
  }

  const orgStateIds = orgStateRows.map((r) => r.stateId);

  // 4. Validate ward and organisation state consistency: reject (422) on disagreement
  if (wardStateId && orgStateIds.length > 0) {
    if (!orgStateIds.includes(wardStateId)) {
      throw new UnprocessableEntityException({
        title: 'Unprocessable Entity',
        detail: "Location mismatch: Ward state does not belong to the organisation's state",
        errors: [
          {
            field: 'wardId',
            message: "Ward's state does not match the assigned organisation's state",
          },
        ],
      });
    }
  }

  let schemeId: string | undefined;
  let sectorId: string | undefined;

  if (org.type === 'scheme') {
    schemeId = org.id;
  } else if (org.type === 'sector') {
    sectorId = org.id;
    schemeId = org.parentId ?? undefined;
  }

  const effectiveStateId = wardStateId ?? orgStateIds[0];

  return {
    wardStateId,
    orgStateIds,
    effectiveStateId,
    schemeId,
    sectorId,
    organisationType: org.type,
  };
}

/**
 * Checks if a derived location is permitted within a permission's RequestScope.
 */
export function isLocationInScope(scope: RequestScope, location: DerivedLocation): boolean {
  if (scope.isNational) {
    return true;
  }

  // Check state match
  if (location.effectiveStateId && scope.stateIds.includes(location.effectiveStateId)) {
    return true;
  }

  // Check scheme match
  if (location.schemeId && scope.schemeIds.includes(location.schemeId)) {
    return true;
  }

  // Check sector match
  if (location.sectorId && scope.sectorIds.includes(location.sectorId)) {
    return true;
  }

  return false;
}

/**
 * Enforces scope for write operations (create and update).
 * For creates: target location must be in scope; throws 403 Forbidden if not.
 * For updates: existing location must be in scope (throws 404 Not Found to prevent existence leak);
 *              proposed new location must be in scope (throws 403 Forbidden to prevent moving records out).
 */
export async function assertInScope(
  authz: UserAuthz,
  permission: Permission,
  newLocationInput: LocationInput,
  existingLocationInput?: LocationInput,
): Promise<DerivedLocation> {
  const scope = authz.scopeFor(permission);

  // If this is an update, verify the existing record was already in scope
  if (existingLocationInput) {
    const existingDerived = await deriveLocationServerSide(existingLocationInput);
    if (!isLocationInScope(scope, existingDerived)) {
      throw new NotFoundException('Record not found');
    }
  }

  // Verify proposed new location
  const newDerived = await deriveLocationServerSide(newLocationInput);
  if (!isLocationInScope(scope, newDerived)) {
    if (existingLocationInput) {
      throw new ForbiddenException('Cannot move record to a location outside your assigned scope');
    }
    throw new ForbiddenException('Target location is outside your assigned scope');
  }

  return newDerived;
}
