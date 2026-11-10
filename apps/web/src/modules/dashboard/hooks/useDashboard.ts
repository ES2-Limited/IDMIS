import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { DashboardResponse } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const DASHBOARD_QUERY_KEY = ['dashboards'] as const;

export function useProgrammeDashboard(query?: Record<string, unknown>) {
  const { isAuthenticated } = useAuth();

  return useQuery<DashboardResponse>({
    queryKey: [...DASHBOARD_QUERY_KEY, 'programme', query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getProgrammeDashboard(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useStateDashboard(stateId?: string, query?: Record<string, unknown>) {
  const { isAuthenticated } = useAuth();

  return useQuery<DashboardResponse>({
    queryKey: [...DASHBOARD_QUERY_KEY, 'state', stateId, query],
    queryFn: async () => {
      if (!stateId) throw new Error('stateId is required');
      const client = getApiClient();
      return client.getStateDashboard(stateId, query);
    },
    enabled: isAuthenticated && Boolean(stateId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSchemeDashboard(schemeId?: string, query?: Record<string, unknown>) {
  const { isAuthenticated } = useAuth();

  return useQuery<DashboardResponse>({
    queryKey: [...DASHBOARD_QUERY_KEY, 'scheme', schemeId, query],
    queryFn: async () => {
      if (!schemeId) throw new Error('schemeId is required');
      const client = getApiClient();
      return client.getSchemeDashboard(schemeId, query);
    },
    enabled: isAuthenticated && Boolean(schemeId),
    staleTime: 1000 * 60 * 5,
  });
}
