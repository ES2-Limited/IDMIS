import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { ListFeeBillingsQuery, FeeBillingResponse } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_FEE_BILLINGS_QUERY_KEY = ['slis', 'fee-billings'] as const;

export function useFeeBillings(query?: ListFeeBillingsQuery) {
  const { isAuthenticated } = useAuth();

  const billingsQuery = useQuery({
    queryKey: [...SLIS_FEE_BILLINGS_QUERY_KEY, query],
    queryFn: async (): Promise<{ items: FeeBillingResponse[]; nextCursor?: string | null }> => {
      const client = getApiClient();
      return client.getFeeBillings(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  return {
    billings: billingsQuery.data?.items ?? [],
    total: billingsQuery.data?.items.length ?? 0,
    isLoading: billingsQuery.isLoading,
    error: billingsQuery.error,
    refetch: billingsQuery.refetch,
  };
}

