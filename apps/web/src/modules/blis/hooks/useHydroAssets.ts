import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { Reservoir, BasinMorphometry } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const BLIS_RESERVOIRS_KEY = ['blis', 'reservoirs'] as const;
export const BLIS_MORPHOMETRY_KEY = ['blis', 'morphometry'] as const;

function extractList<T>(raw: unknown): { items: T[]; total: number } {
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { items?: unknown; data?: unknown; total?: number };
    if (Array.isArray(obj.items)) {
      return { items: obj.items as T[], total: obj.total ?? obj.items.length };
    }
    if (Array.isArray(obj.data)) {
      return { items: obj.data as T[], total: obj.total ?? obj.data.length };
    }
  }
  return { items: [], total: 0 };
}

export function useReservoirs(basinId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const reservoirsQuery = useQuery({
    queryKey: [...BLIS_RESERVOIRS_KEY, basinId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (basinId) params.set('basinId', basinId);
      return client.get<Reservoir[] | { data?: Reservoir[]; items?: Reservoir[]; total?: number }>(
        `/blis/reservoirs?${params.toString()}`,
      );
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

  const { items: reservoirs, total } = extractList<Reservoir>(reservoirsQuery.data);

  return {
    reservoirs,
    total,
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
      const res = await client.get<
        | BasinMorphometry[]
        | { data?: BasinMorphometry[]; items?: BasinMorphometry[]; total?: number }
      >(`/blis/basin-morphometry?basinId=${basinId}`);
      return extractList<BasinMorphometry>(res).items;
    },
    enabled: isAuthenticated && Boolean(basinId),
    staleTime: 1000 * 60 * 15,
  });
}
