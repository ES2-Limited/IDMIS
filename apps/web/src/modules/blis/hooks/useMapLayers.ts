import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { MapLayer, MapFeature, UploadGeoJsonInput } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const BLIS_MAP_LAYERS_KEY = ['blis', 'map-layers'] as const;
export const BLIS_MAP_FEATURES_KEY = ['blis', 'map-features'] as const;

export function useMapLayers(basinId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const layersQuery = useQuery({
    queryKey: [...BLIS_MAP_LAYERS_KEY, basinId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (basinId) params.set('basinId', basinId);
      return client.get<MapLayer[]>(`/blis/map/layers?${params.toString()}`);
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

  return {
    layers: layersQuery.data ?? [],
    isLoading: layersQuery.isLoading,
    isFetching: layersQuery.isFetching,
    error: layersQuery.error,
    refetch: layersQuery.refetch,
    uploadGeoJson: uploadGeoJsonMutation.mutateAsync,
    isUploading: uploadGeoJsonMutation.isPending,
  };
}

export function useMapLayerFeatures(layerId?: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...BLIS_MAP_FEATURES_KEY, layerId],
    queryFn: async () => {
      if (!layerId) return [];
      const client = getApiClient();
      return client.get<MapFeature[]>(`/blis/map/layers/${layerId}/features`);
    },
    enabled: isAuthenticated && Boolean(layerId),
    staleTime: 1000 * 60 * 15,
  });
}
