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

  return {
    basins: (basinsQuery.data as Basin[] | undefined) ?? [],
    isLoading: basinsQuery.isLoading,
    isFetching: basinsQuery.isFetching,
    error: basinsQuery.error,
    refetch: basinsQuery.refetch,
    createBasin: createBasinMutation.mutateAsync,
    isCreating: createBasinMutation.isPending,
  };
}
