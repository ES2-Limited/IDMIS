import { useMemo } from 'react';
import { useAuth } from './AuthContext';

/**
 * Hook to check if current authenticated user has a specific permission.
 * Supports:
 * - Superadmin wildcard: '*' matches all permissions
 * - Module wildcard: 'slis.*' matches any 'slis.farmer.create'
 * - Exact match: 'slis.farmer.create' matches 'slis.farmer.create'
 */
export function useCan(requiredPermission?: string): boolean {
  const { permissions, user } = useAuth();

  return useMemo(() => {
    if (!requiredPermission) return true;
    if (!user) return false;
    if (user.isSystemAdmin) return true;

    return permissions.some((perm) => {
      if (perm === '*') return true;
      if (perm === requiredPermission) return true;
      if (perm.endsWith('.*')) {
        const prefix = perm.slice(0, -2);
        return requiredPermission.startsWith(prefix);
      }
      return false;
    });
  }, [permissions, user, requiredPermission]);
}
