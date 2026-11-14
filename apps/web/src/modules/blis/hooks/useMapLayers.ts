import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { MapLayer, UploadGeoJsonInput, UploadShapefileInput } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const BLIS_MAP_LAYERS_KEY = ['blis', 'map-layers'] as const;

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

export function useMapLayers(basinId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const layersQuery = useQuery({
    queryKey: [...BLIS_MAP_LAYERS_KEY, basinId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (basinId) params.set('basinId', basinId);
      return client.get<MapLayer[] | { data?: MapLayer[]; items?: MapLayer[]; total?: number }>(
        `/blis/map/layers?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const uploadGeoJsonMutation = useMutation({
    mutationFn: async (payload: UploadGeoJsonInput) => {
      const client = getApiClient();
      return client.post<MapLayer>('/blis/map/layers/geojson', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_MAP_LAYERS_KEY });
    },
  });

  const uploadShapefileMutation = useMutation({
    mutationFn: async (payload: UploadShapefileInput) => {
      const client = getApiClient();
      return client.post<MapLayer>('/blis/map/layers/shapefile', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_MAP_LAYERS_KEY });
    },
  });

  const { items: layers, total } = extractList<MapLayer>(layersQuery.data);

  return {
    layers,
    total,
    isLoading: layersQuery.isLoading,
    isFetching: layersQuery.isFetching,
    error: layersQuery.error,
    refetch: layersQuery.refetch,
    uploadGeoJson: uploadGeoJsonMutation.mutateAsync,
    isUploadingGeoJson: uploadGeoJsonMutation.isPending,
    uploadShapefile: uploadShapefileMutation.mutateAsync,
    isUploadingShapefile: uploadShapefileMutation.isPending,
    isUploading: uploadGeoJsonMutation.isPending || uploadShapefileMutation.isPending,
  };
}
