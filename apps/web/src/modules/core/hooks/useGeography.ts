import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { StateResponse, LgaResponse, WardResponse } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const GEOGRAPHY_STATES_KEY = ['geography', 'states'] as const;
export const GEOGRAPHY_LGAS_KEY = ['geography', 'lgas'] as const;
export const GEOGRAPHY_WARDS_KEY = ['geography', 'wards'] as const;

export function useGeography() {
  const { isAuthenticated } = useAuth();

  const statesQuery = useQuery({
    queryKey: GEOGRAPHY_STATES_KEY,
    queryFn: async () => {
      const client = getApiClient();
      return client.getStates();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  return {
    states: Array.isArray(statesQuery.data)
      ? (statesQuery.data as StateResponse[])
      : (statesQuery.data?.items ?? []),
    isLoadingStates: statesQuery.isLoading,
    statesError: statesQuery.error,
    refetchStates: statesQuery.refetch,
  };
}

export function useLgas(stateId?: string) {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: [...GEOGRAPHY_LGAS_KEY, stateId],
    queryFn: async () => {
      if (!stateId) return [] as LgaResponse[];
      const client = getApiClient();
      const res = await client.getLgas({ stateId, limit: 100 });
      return Array.isArray(res) ? (res as LgaResponse[]) : (res.items ?? []);
    },
    enabled: isAuthenticated && Boolean(stateId),
    staleTime: 1000 * 60 * 60,
  });

  return {
    lgas: (query.data ?? []) as LgaResponse[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useWards(lgaId?: string) {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: [...GEOGRAPHY_WARDS_KEY, lgaId],
    queryFn: async () => {
      if (!lgaId) return [] as WardResponse[];
      const client = getApiClient();
      const res = await client.getWards({ lgaId, limit: 100 });
      return Array.isArray(res) ? (res as WardResponse[]) : (res.items ?? []);
    },
    enabled: isAuthenticated && Boolean(lgaId),
    staleTime: 1000 * 60 * 60,
  });

  return {
    wards: (query.data ?? []) as WardResponse[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
