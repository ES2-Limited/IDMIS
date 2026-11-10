import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  Indicator,
  BaseListQuery,
  IndicatorMatrixResponse,
  CreateIndicatorValueInput,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const ME_INDICATORS_QUERY_KEY = ['me', 'indicators'] as const;
export const ME_MATRIX_QUERY_KEY = ['me', 'matrix'] as const;

export function useIndicators(query?: BaseListQuery) {
  const { isAuthenticated } = useAuth();

  const indicatorsQuery = useQuery({
    queryKey: [...ME_INDICATORS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getIndicators(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  return {
    indicators: (indicatorsQuery.data?.items as Indicator[] | undefined) ?? [],
    total: indicatorsQuery.data?.total,
    isLoading: indicatorsQuery.isLoading,
    isFetching: indicatorsQuery.isFetching,
    error: indicatorsQuery.error,
    refetch: indicatorsQuery.refetch,
  };
}

export function useIndicatorMatrix() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const matrixQuery = useQuery({
    queryKey: ME_MATRIX_QUERY_KEY,
    queryFn: async () => {
      const client = getApiClient();
      return client.getIndicatorMatrix();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const submitQuarterlyMutation = useMutation({
    mutationFn: async (payload: CreateIndicatorValueInput) => {
      const client = getApiClient();
      return client.submitQuarterlyValue(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_MATRIX_QUERY_KEY });
    },
  });

  return {
    matrix: matrixQuery.data as IndicatorMatrixResponse | undefined,
    isLoading: matrixQuery.isLoading,
    isFetching: matrixQuery.isFetching,
    error: matrixQuery.error,
    refetch: matrixQuery.refetch,
    submitQuarterlyValue: submitQuarterlyMutation.mutateAsync,
    isSubmitting: submitQuarterlyMutation.isPending,
  };
}
