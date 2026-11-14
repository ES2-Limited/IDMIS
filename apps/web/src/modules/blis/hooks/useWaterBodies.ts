import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateStationInput,
  Station,
  ListStationsQuery,
  CreateDamInput,
  Dam,
  ListDamsQuery,
  CreateDamSafetyInspectionInput,
  DamSafetyInspection,
  ListDamInspectionsQuery,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const BLIS_STATIONS_QUERY_KEY = ['blis', 'stations'] as const;
export const BLIS_DAMS_QUERY_KEY = ['blis', 'dams'] as const;
export const BLIS_INSPECTIONS_QUERY_KEY = ['blis', 'inspections'] as const;

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

export function useStations(query?: Partial<ListStationsQuery>) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const stationsQuery = useQuery({
    queryKey: [...BLIS_STATIONS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getStations({
        page: query?.page ?? 1,
        limit: query?.limit ?? 50,
        basinId: query?.basinId,
        stationTypeId: query?.stationTypeId,
        search: query?.search,
      });
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  });

  const createStationMutation = useMutation({
    mutationFn: async (payload: CreateStationInput) => {
      const client = getApiClient();
      return client.createStation(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_STATIONS_QUERY_KEY });
    },
  });

  const { items: stations, total } = extractList<Station>(stationsQuery.data);

  return {
    stations,
    total: stationsQuery.data?.total ?? total,
    isLoading: stationsQuery.isLoading,
    isFetching: stationsQuery.isFetching,
    error: stationsQuery.error,
    refetch: stationsQuery.refetch,
    createStation: createStationMutation.mutateAsync,
    isCreating: createStationMutation.isPending,
  };
}

export function useDams(query?: Partial<ListDamsQuery>) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const damsQuery = useQuery({
    queryKey: [...BLIS_DAMS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getDams({
        page: query?.page ?? 1,
        limit: query?.limit ?? 50,
        basinId: query?.basinId,
        reservoirId: query?.reservoirId,
        purposeId: query?.purposeId,
        search: query?.search,
      });
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  });

  const createDamMutation = useMutation({
    mutationFn: async (payload: CreateDamInput) => {
      const client = getApiClient();
      return client.createDam(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_DAMS_QUERY_KEY });
    },
  });

  const { items: dams, total } = extractList<Dam>(damsQuery.data);

  return {
    dams,
    total: damsQuery.data?.total ?? total,
    isLoading: damsQuery.isLoading,
    isFetching: damsQuery.isFetching,
    error: damsQuery.error,
    refetch: damsQuery.refetch,
    createDam: createDamMutation.mutateAsync,
    isCreating: createDamMutation.isPending,
  };
}

export function useDamInspections(query?: ListDamInspectionsQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const inspectionsQuery = useQuery({
    queryKey: [...BLIS_INSPECTIONS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getDamInspections(query);
    },
    enabled: isAuthenticated,
  });

  const createInspectionMutation = useMutation({
    mutationFn: async (payload: CreateDamSafetyInspectionInput) => {
      const client = getApiClient();
      return client.createDamInspection(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLIS_INSPECTIONS_QUERY_KEY });
    },
  });

  const { items: inspections, total } = extractList<DamSafetyInspection>(inspectionsQuery.data);

  return {
    inspections,
    total: inspectionsQuery.data?.total ?? total,
    isLoading: inspectionsQuery.isLoading,
    isFetching: inspectionsQuery.isFetching,
    error: inspectionsQuery.error,
    refetch: inspectionsQuery.refetch,
    createInspection: createInspectionMutation.mutateAsync,
    isCreating: createInspectionMutation.isPending,
  };
}
