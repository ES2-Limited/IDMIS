import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  ListReviewQueueQuery,
  ReviewQueueItem,
  ApproveRecordInput,
  ReturnRecordInput,
  BulkApproveInput,
  BulkApproveResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_REVIEW_QUERY_KEY = ['slis', 'review'] as const;

export function useReviewQueue(query?: ListReviewQueueQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const reviewQuery = useQuery({
    queryKey: [...SLIS_REVIEW_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (query?.schemeId) params.set('schemeId', query.schemeId);
      if (query?.entity) params.set('entity', query.entity);
      if (query?.status) params.set('status', query.status);
      if (query?.cursor) params.set('cursor', query.cursor);
      if (query?.limit) params.set('limit', String(query.limit));

      const res = await client.get<{ items: ReviewQueueItem[]; total: number }>(
        `/slis/review?${params.toString()}`,
      );
      return res;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      entity,
      id,
      payload,
    }: {
      entity: string;
      id: string;
      payload?: ApproveRecordInput;
    }) => {
      const client = getApiClient();
      return client.post(`/slis/review/${entity}/${id}/approve`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_REVIEW_QUERY_KEY });
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({
      entity,
      id,
      payload,
    }: {
      entity: string;
      id: string;
      payload: ReturnRecordInput;
    }) => {
      const client = getApiClient();
      return client.post(`/slis/review/${entity}/${id}/return`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_REVIEW_QUERY_KEY });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (payload: BulkApproveInput) => {
      const client = getApiClient();
      return client.post<BulkApproveResponse>('/slis/review/bulk-approve', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLIS_REVIEW_QUERY_KEY });
    },
  });

  return {
    items: reviewQuery.data?.items ?? [],
    total: reviewQuery.data?.total ?? 0,
    isLoading: reviewQuery.isLoading,
    isFetching: reviewQuery.isFetching,
    error: reviewQuery.error,
    refetch: reviewQuery.refetch,
    approveRecord: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    returnRecord: returnMutation.mutateAsync,
    isReturning: returnMutation.isPending,
    bulkApprove: bulkApproveMutation.mutateAsync,
    isBulkApproving: bulkApproveMutation.isPending,
  };
}
