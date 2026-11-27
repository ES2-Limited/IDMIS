import { useMemo } from 'react';
import { useAuth } from './AuthContext';

export function hasPermission(
  user: { isSystemAdmin?: boolean } | null | undefined,
  permissions: string[],
  requiredPermission?: string | string[],
): boolean {
  if (!requiredPermission) return true;
  const requiredList = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];
  if (requiredList.length === 0) return true;
  if (!user) return false;
  if (user.isSystemAdmin) return true;

  return requiredList.some((req) =>
    permissions.some((perm) => {
      if (perm === '*') return true;
      if (perm === req) return true;
      if (perm.endsWith('.*')) {
        const prefix = perm.slice(0, -2);
        return req.startsWith(prefix);
      }
      return false;
    }),
  );
}

/**
 * Hook to check if current authenticated user has a specific permission (or at least one of an array of permissions).
 * Supports:
 * - Superadmin wildcard: '*' matches all permissions
 * - Module wildcard: 'slis.*' matches any 'slis.farmer.create'
 * - Exact match: 'slis.farmer.create' matches 'slis.farmer.create'
 */
export function useCan(requiredPermission?: string | string[]): boolean {
  const { permissions, user } = useAuth();

  return useMemo(
    () => hasPermission(user, permissions, requiredPermission),
    [permissions, user, requiredPermission],
  );
}
