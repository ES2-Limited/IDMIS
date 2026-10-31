import { sql, inArray, or, type SQL, type AnyPgColumn } from '@idmis/db';
import type { RequestScope } from '@idmis/contracts';

export interface ScopeColumnMap {
  state?: AnyPgColumn;
  scheme?: AnyPgColumn;
  sector?: AnyPgColumn;
  organisation?: AnyPgColumn;
}

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
