import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { CreateOrganisationInput, ListOrganisationsQuery, OrganisationResponse } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_ORGS_QUERY_KEY = ['core', 'organisations'] as const;

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

  return {
    organisations: (orgsQuery.data as OrganisationResponse[] | undefined) ?? [],
    isLoading: orgsQuery.isLoading,
    isFetching: orgsQuery.isFetching,
    error: orgsQuery.error,
    refetch: orgsQuery.refetch,
    createOrganisation: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
  };
}
