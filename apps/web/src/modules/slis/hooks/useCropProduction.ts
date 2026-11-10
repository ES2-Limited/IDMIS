import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateCropProductionInput,
  UpdateCropProductionInput,
  ListCropProductionsQuery,
  CropProductionResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_CROP_PRODUCTION_QUERY_KEY = ['slis', 'crop-production'] as const;

export function useCropProductions(query?: ListCropProductionsQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const cropsQuery = useQuery({
    queryKey: [...SLIS_CROP_PRODUCTION_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (query?.schemeId) params.set('schemeId', query.schemeId);
      if (query?.plotId) params.set('plotId', query.plotId);
      if (query?.seasonId) params.set('seasonId', query.seasonId);
      if (query?.cropTypeId) params.set('cropTypeId', query.cropTypeId);
      if (query?.status) params.set('status', query.status);

      return client.get<{ items: CropProductionResponse[]; total: number }>(
        `/slis/crop-production?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const createCropMutation = useMutation({
    mutationFn: async (payload: CreateCropProductionInput) => {
      const client = getApiClient();
      return client.post<CropProductionResponse>('/slis/crop-production', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_CROP_PRODUCTION_QUERY_KEY });
    },
  });

  const updateCropMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCropProductionInput }) => {
      const client = getApiClient();
      return client.patch<CropProductionResponse>(`/slis/crop-production/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_CROP_PRODUCTION_QUERY_KEY });
    },
  });

  return {
    cropProductions: cropsQuery.data?.items ?? [],
    total: cropsQuery.data?.total ?? 0,
    isLoading: cropsQuery.isLoading,
    isFetching: cropsQuery.isFetching,
    error: cropsQuery.error,
    refetch: cropsQuery.refetch,
    createCropProduction: createCropMutation.mutateAsync,
    isCreating: createCropMutation.isPending,
    updateCropProduction: updateCropMutation.mutateAsync,
    isUpdating: updateCropMutation.isPending,
  };
}
