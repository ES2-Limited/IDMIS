import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateWuaInput,
  WuaResponse,
  ListWuasQuery,
  LookupValueResponse,
  ImportBatchResponse,
  InitiateImportInput,
  ListImportBatchesQuery,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_WUAS_KEY = ['core', 'wuas'] as const;
export const CORE_LOOKUPS_KEY = ['core', 'lookups'] as const;
export const CORE_IMPORTS_KEY = ['core', 'imports'] as const;

export function useWuas(query?: ListWuasQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const wuasQuery = useQuery({
    queryKey: [...CORE_WUAS_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (query?.organisationId) params.set('organisationId', query.organisationId);
      if (query?.level) params.set('level', query.level);
      if (query?.isOperational !== undefined)
        params.set('isOperational', String(query.isOperational));

      return client.get<{ items: WuaResponse[]; total: number }>(`/wuas?${params.toString()}`);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createWuaMutation = useMutation({
    mutationFn: async (payload: CreateWuaInput) => {
      const client = getApiClient();
      return client.post<WuaResponse>('/wuas', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_WUAS_KEY });
    },
  });

  return {
    wuas: wuasQuery.data?.items ?? [],
    total: wuasQuery.data?.total ?? 0,
    isLoading: wuasQuery.isLoading,
    isFetching: wuasQuery.isFetching,
    error: wuasQuery.error,
    refetch: wuasQuery.refetch,
    createWua: createWuaMutation.mutateAsync,
    isCreating: createWuaMutation.isPending,
  };
}

export function useLookupValues(typeKey: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...CORE_LOOKUPS_KEY, typeKey],
    queryFn: async () => {
      const client = getApiClient();
      return client.get<LookupValueResponse[]>(`/lookups/${typeKey}/values`);
    },
    enabled: isAuthenticated && Boolean(typeKey),
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });
}

export function useImportBatches(query?: ListImportBatchesQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const batchesQuery = useQuery({
    queryKey: [...CORE_IMPORTS_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (query?.dataset) params.set('dataset', query.dataset);
      if (query?.status) params.set('status', query.status);
      if (query?.schemeId) params.set('schemeId', query.schemeId);

      return client.get<{ items: ImportBatchResponse[]; total: number }>(
        `/imports/batches?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const initiateImportMutation = useMutation({
    mutationFn: async (payload: InitiateImportInput) => {
      const client = getApiClient();
      return client.post<ImportBatchResponse>('/imports/batches', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_IMPORTS_KEY });
    },
  });

  const commitBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const client = getApiClient();
      return client.post<ImportBatchResponse>(`/imports/batches/${batchId}/commit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_IMPORTS_KEY });
    },
  });

  const undoBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const client = getApiClient();
      return client.post<ImportBatchResponse>(`/imports/batches/${batchId}/undo`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_IMPORTS_KEY });
    },
  });

  return {
    batches: batchesQuery.data?.items ?? [],
    total: batchesQuery.data?.total ?? 0,
    isLoading: batchesQuery.isLoading,
    isFetching: batchesQuery.isFetching,
    error: batchesQuery.error,
    refetch: batchesQuery.refetch,
    initiateImport: initiateImportMutation.mutateAsync,
    isInitiating: initiateImportMutation.isPending,
    commitBatch: commitBatchMutation.mutateAsync,
    isCommitting: commitBatchMutation.isPending,
    undoBatch: undoBatchMutation.mutateAsync,
    isUndoing: undoBatchMutation.isPending,
  };
}
