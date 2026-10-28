import { sql, inArray, or, type SQL, type AnyPgColumn } from '@idmis/db';
import type { RequestScope } from '@idmis/contracts';

export interface ScopeColumnMap {
  state?: AnyPgColumn;
  scheme?: AnyPgColumn;
  sector?: AnyPgColumn;
  organisation?: AnyPgColumn;
}

/**
 * Applies an explicit column mapping to filter Drizzle queries by a permission's scope.
 * Never guesses column names. Returns undefined if national scope (no filter needed).
 * Returns `1 = 0` if the user's scope matches no requested filter columns.
 */
export function applyScope(scope: RequestScope, columns: ScopeColumnMap): SQL | undefined {
  if (scope.isNational) {
    return undefined;
  }

  const conditions: SQL[] = [];

  if (columns.state && scope.stateIds.length > 0) {
    conditions.push(inArray(columns.state, scope.stateIds));
  }
  if (columns.scheme && scope.schemeIds.length > 0) {
    conditions.push(inArray(columns.scheme, scope.schemeIds));
  }
  if (columns.sector && scope.sectorIds.length > 0) {
    conditions.push(inArray(columns.sector, scope.sectorIds));
  }
  if (columns.organisation) {
    // When an organisation column is used, match either schemes or sectors in scope
    const orgIds = Array.from(new Set([...scope.schemeIds, ...scope.sectorIds]));
    if (orgIds.length > 0) {
      conditions.push(inArray(columns.organisation, orgIds));
    }
  }

  if (conditions.length === 0) {
    return sql`1 = 0`;
  }

  return or(...conditions);
}
