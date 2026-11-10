import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateAppUserInput,
  UpdateAppUserInput,
  ListAppUsersQuery,
  AppUserResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_USERS_QUERY_KEY = ['core', 'users'] as const;

export function useUsers(query?: ListAppUsersQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: [...CORE_USERS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getUsers(query);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateAppUserInput) => {
      const client = getApiClient();
      return client.createUser(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_USERS_QUERY_KEY });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateAppUserInput }) => {
      const client = getApiClient();
      return client.updateUser(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_USERS_QUERY_KEY });
    },
  });

  return {
    users: (usersQuery.data?.items as AppUserResponse[] | undefined) ?? [],
    total: usersQuery.data?.total,
    isLoading: usersQuery.isLoading,
    isFetching: usersQuery.isFetching,
    error: usersQuery.error,
    refetch: usersQuery.refetch,
    createUser: createUserMutation.mutateAsync,
    isCreating: createUserMutation.isPending,
    updateUser: updateUserMutation.mutateAsync,
    isUpdating: updateUserMutation.isPending,
  };
}
