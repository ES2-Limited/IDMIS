import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  OrganisationResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_ORGS_QUERY_KEY = ['core', 'organisations'] as const;

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

export function useOrganisations(query?: Partial<ListOrganisationsQuery>) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: [...CORE_ORGS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getOrganisations(query as ListOrganisationsQuery | undefined);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createOrgMutation = useMutation({
    mutationFn: async (payload: CreateOrganisationInput) => {
      const client = getApiClient();
      return client.createOrganisation(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_ORGS_QUERY_KEY });
    },
  });

  const { items: organisations, total } = extractList<OrganisationResponse>(orgsQuery.data);

  return {
    organisations,
    total,
    isLoading: orgsQuery.isLoading,
    isFetching: orgsQuery.isFetching,
    error: orgsQuery.error,
    refetch: orgsQuery.refetch,
    createOrganisation: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
  };
}
