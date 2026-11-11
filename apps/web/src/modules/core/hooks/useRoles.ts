import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { RoleResponse } from '@idmis/contracts';
import { useAuth } from '../../../auth';
import { mockRoles } from '../../../mocks/coreData';

export const CORE_ROLES_QUERY_KEY = ['core', 'roles'] as const;

export function useRoles() {
  const { isAuthenticated } = useAuth();

  const rolesQuery = useQuery({
    queryKey: CORE_ROLES_QUERY_KEY,
    queryFn: async () => {
      const client = getApiClient();
      return client.get<RoleResponse[]>('/admin/assignments/roles');
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30, // 30 minutes cache for system roles
  });

  return {
    roles: rolesQuery.data && rolesQuery.data.length > 0 ? rolesQuery.data : mockRoles,
    isLoading: rolesQuery.isLoading,
    isFetching: rolesQuery.isFetching,
    error: rolesQuery.error,
    refetch: rolesQuery.refetch,
  };
}
