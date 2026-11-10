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

  return {
    stations: (stationsQuery.data?.items as Station[] | undefined) ?? [],
    total: stationsQuery.data?.total,
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

  return {
    dams: (damsQuery.data?.items as Dam[] | undefined) ?? [],
    total: damsQuery.data?.total,
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

  return {
    inspections: (inspectionsQuery.data?.items as DamSafetyInspection[] | undefined) ?? [],
    total: inspectionsQuery.data?.total,
    isLoading: inspectionsQuery.isLoading,
    isFetching: inspectionsQuery.isFetching,
    error: inspectionsQuery.error,
    refetch: inspectionsQuery.refetch,
    createInspection: createInspectionMutation.mutateAsync,
    isCreating: createInspectionMutation.isPending,
  };
}
