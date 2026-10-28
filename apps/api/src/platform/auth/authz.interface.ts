import type { RequestScope, Permission, CaslRule } from '@idmis/contracts';

export interface UserAuthz {
  readonly userId: string;
  readonly isSystemAdmin: boolean; // UI informational only! Never used for access decisions.
  readonly permissions: string[];
  readonly permissionScopes: Record<string, RequestScope>;
  readonly rules: CaslRule[];
  can(permission: Permission | string): boolean;
  scopeFor(permission: Permission | string): RequestScope;
}
