import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateFarmerInput,
  UpdateFarmerInput,
  ListFarmersQuery,
  FarmerResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_FARMERS_QUERY_KEY = ['slis', 'farmers'] as const;

export function useFarmers(query?: ListFarmersQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const farmersQuery = useQuery({
    queryKey: [...SLIS_FARMERS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getFarmers(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const createFarmerMutation = useMutation({
    mutationFn: async (payload: CreateFarmerInput) => {
      const client = getApiClient();
      return client.createFarmer(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_FARMERS_QUERY_KEY });
    },
  });

  const updateFarmerMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateFarmerInput }) => {
      const client = getApiClient();
      return client.updateFarmer(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_FARMERS_QUERY_KEY });
    },
  });

  return {
    farmers: (farmersQuery.data?.items as FarmerResponse[] | undefined) ?? [],
    total: farmersQuery.data?.total,
    isLoading: farmersQuery.isLoading,
    isFetching: farmersQuery.isFetching,
    error: farmersQuery.error,
    refetch: farmersQuery.refetch,
    createFarmer: createFarmerMutation.mutateAsync,
    isCreating: createFarmerMutation.isPending,
    updateFarmer: updateFarmerMutation.mutateAsync,
    isUpdating: updateFarmerMutation.isPending,
  };
}

export function useFarmer(id?: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...SLIS_FARMERS_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) throw new Error('Farmer ID is required');
      const client = getApiClient();
      return client.getFarmer(id);
    },
    enabled: isAuthenticated && Boolean(id),
  });
}
