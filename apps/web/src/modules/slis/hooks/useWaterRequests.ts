import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateWaterRequestInput,
  DecideWaterRequestInput,
  WaterRequestResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_WATER_REQUESTS_QUERY_KEY = ['slis', 'water-requests'] as const;

export function useWaterRequests(schemeId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: [...SLIS_WATER_REQUESTS_QUERY_KEY, schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<{ items: WaterRequestResponse[]; total: number }>(
        `/slis/water-requests?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const createRequestMutation = useMutation({
    mutationFn: async (payload: CreateWaterRequestInput) => {
      const client = getApiClient();
      return client.post<WaterRequestResponse>('/slis/water-requests', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_WATER_REQUESTS_QUERY_KEY });
    },
  });

  const decideRequestMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: DecideWaterRequestInput }) => {
      const client = getApiClient();
      return client.post<WaterRequestResponse>(`/slis/water-requests/${id}/decide`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_WATER_REQUESTS_QUERY_KEY });
    },
  });

  return {
    requests: requestsQuery.data?.items ?? [],
    total: requestsQuery.data?.total ?? 0,
    isLoading: requestsQuery.isLoading,
    isFetching: requestsQuery.isFetching,
    error: requestsQuery.error,
    refetch: requestsQuery.refetch,
    createWaterRequest: createRequestMutation.mutateAsync,
    isCreating: createRequestMutation.isPending,
    decideWaterRequest: decideRequestMutation.mutateAsync,
    isDeciding: decideRequestMutation.isPending,
  };
}
