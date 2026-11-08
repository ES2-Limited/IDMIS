import { NotFoundException } from '@nestjs/common';
import type { RequestScope, Permission } from '@idmis/contracts';
import { db, basin, eq, and, isNull } from '@idmis/db';
import type { UserAuthz } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';

/**
 * Asserts RBDA scoping rules for BLIS assets:
 * - National users (isNational === true) can access all assets.
 * - Non-national users must have an RBDA in scope (`scope.rbdaIds`).
 * - Basins with `rbda_id === null` are national-only.
 * - Out-of-scope requests throw NotFoundException (404).
 */
export async function assertBlisScope(
  authz: UserAuthz,
  permission: Permission | string,
  target: {
    rbdaId?: string | null;
    basinId?: string | null;
  },
  txDb?: DatabaseOrTx,
): Promise<RequestScope> {
  const scope = authz.scopeFor(permission);

  if (scope.isNational) {
    return scope;
  }

  if (!scope.rbdaIds || scope.rbdaIds.length === 0) {
    throw new NotFoundException('Asset not found or outside assigned scope');
  }

  let effectiveRbdaId: string | null = target.rbdaId ?? null;

  if (!effectiveRbdaId && target.basinId) {
    const client = txDb ?? db;
    const [b] = await client
      .select({ id: basin.id, rbdaId: basin.rbdaId })
      .from(basin)
      .where(and(eq(basin.id, target.basinId), isNull(basin.deletedAt)))
      .limit(1);

    if (!b) {
      throw new NotFoundException('Basin not found');
    }
    effectiveRbdaId = b.rbdaId;
  }

  // Basins with null rbda_id are national-only
  if (!effectiveRbdaId) {
    throw new NotFoundException('Asset not found or outside assigned scope');
  }

  if (!scope.rbdaIds.includes(effectiveRbdaId)) {
    throw new NotFoundException('Asset not found or outside assigned scope');
  }

  return scope;
}

/**
 * Synchronous check whether an RBDA is within scope.
 */
export function isRbdaInScope(scope: RequestScope, rbdaId: string | null | undefined): boolean {
  if (scope.isNational) {
    return true;
  }
  if (!rbdaId) {
    // Null rbda_id is national-only
    return false;
  }
  return scope.rbdaIds.includes(rbdaId);
}
