import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { CreateBasinInput, Basin } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const BLIS_BASINS_QUERY_KEY = ['blis', 'basins'] as const;

export function useBasins() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const basinsQuery = useQuery({
    queryKey: BLIS_BASINS_QUERY_KEY,
    queryFn: async () => {
      const client = getApiClient();
      return client.getBasins();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createBasinMutation = useMutation({
    mutationFn: async (payload: CreateBasinInput) => {
      const client = getApiClient();
      return client.createBasin(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_BASINS_QUERY_KEY });
    },
  });

  // Extract array safely from items, data, or raw array
  const raw = basinsQuery.data as unknown;
  let basins: Basin[] = [];
  let total = 0;

  if (Array.isArray(raw)) {
    basins = raw as Basin[];
    total = raw.length;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as { items?: unknown; data?: unknown; total?: number };
    if (Array.isArray(obj.items)) {
      basins = obj.items as Basin[];
      total = obj.total ?? basins.length;
    } else if (Array.isArray(obj.data)) {
      basins = obj.data as Basin[];
      total = obj.total ?? basins.length;
    }
  }

  return {
    basins,
    total,
    isLoading: basinsQuery.isLoading,
    isFetching: basinsQuery.isFetching,
    error: basinsQuery.error,
    refetch: basinsQuery.refetch,
    createBasin: createBasinMutation.mutateAsync,
    isCreating: createBasinMutation.isPending,
  };
}
