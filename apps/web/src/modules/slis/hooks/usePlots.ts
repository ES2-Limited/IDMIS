import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreatePlotInput,
  UpdatePlotInput,
  ListPlotsQuery,
  PlotResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_PLOTS_QUERY_KEY = ['slis', 'plots'] as const;

export function usePlots(query?: ListPlotsQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const plotsQuery = useQuery({
    queryKey: [...SLIS_PLOTS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getPlots(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const createPlotMutation = useMutation({
    mutationFn: async (payload: CreatePlotInput) => {
      const client = getApiClient();
      return client.createPlot(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_PLOTS_QUERY_KEY });
    },
  });

  const updatePlotMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdatePlotInput }) => {
      const client = getApiClient();
      return client.updatePlot(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_PLOTS_QUERY_KEY });
    },
  });

  return {
    plots: (plotsQuery.data?.items as PlotResponse[] | undefined) ?? [],
    total: plotsQuery.data?.total,
    isLoading: plotsQuery.isLoading,
    isFetching: plotsQuery.isFetching,
    error: plotsQuery.error,
    refetch: plotsQuery.refetch,
    createPlot: createPlotMutation.mutateAsync,
    isCreating: createPlotMutation.isPending,
    updatePlot: updatePlotMutation.mutateAsync,
    isUpdating: updatePlotMutation.isPending,
  };
}

export function usePlot(id?: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...SLIS_PLOTS_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) throw new Error('Plot ID is required');
      const client = getApiClient();
      return client.getPlot(id);
    },
    enabled: isAuthenticated && Boolean(id),
  });
}
