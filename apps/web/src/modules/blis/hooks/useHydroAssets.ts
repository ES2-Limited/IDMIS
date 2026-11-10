import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import { useAuth } from '../../../auth';

export interface Reservoir {
  id: string;
  basinId: string;
  name: string;
  river?: string;
  areaKm2?: string;
  volumeMcm?: string;
  meanDepthM?: string;
  maxDepthM?: string;
  relativeDepth?: string;
  maxLengthKm?: string;
  maxWidthKm?: string;
  meanElevationM?: string;
  sedimentRatio?: string;
  version: number;
}

export interface BasinMorphometry {
  id: string;
  basinId: string;
  measuredOn: string;
  lowestPointM?: string;
  highestPointM?: string;
  avgSlopePct?: string;
  streamCount?: number;
  streamLengthTotalKm?: string;
  streamLengthAvgKm?: string;
  drainageDensity?: string;
  streamOrder?: number;
  reliefM?: string;
  lengthKm?: string;
  perimeterKm?: string;
  version: number;
}

export const BLIS_RESERVOIRS_KEY = ['blis', 'reservoirs'] as const;
export const BLIS_MORPHOMETRY_KEY = ['blis', 'morphometry'] as const;

export function useReservoirs(basinId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const reservoirsQuery = useQuery({
    queryKey: [...BLIS_RESERVOIRS_KEY, basinId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (basinId) params.set('basinId', basinId);
      return client.get<Reservoir[]>(`/blis/reservoirs?${params.toString()}`);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createReservoirMutation = useMutation({
    mutationFn: async (payload: Partial<Reservoir>) => {
      const client = getApiClient();
      return client.post<Reservoir>('/blis/reservoirs', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_RESERVOIRS_KEY });
    },
  });

  return {
    reservoirs: reservoirsQuery.data ?? [],
    isLoading: reservoirsQuery.isLoading,
    isFetching: reservoirsQuery.isFetching,
    error: reservoirsQuery.error,
    refetch: reservoirsQuery.refetch,
    createReservoir: createReservoirMutation.mutateAsync,
    isCreating: createReservoirMutation.isPending,
  };
}

export function useBasinMorphometry(basinId?: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...BLIS_MORPHOMETRY_KEY, basinId],
    queryFn: async () => {
      if (!basinId) return [];
      const client = getApiClient();
      return client.get<BasinMorphometry[]>(`/blis/basins/${basinId}/morphometry`);
    },
    enabled: isAuthenticated && Boolean(basinId),
    staleTime: 1000 * 60 * 15,
  });
}
