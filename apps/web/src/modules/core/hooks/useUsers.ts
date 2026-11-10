import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  CreateAppUserInput,
  UpdateAppUserInput,
  ListAppUsersQuery,
  AppUserResponse,
  AssignmentResponse,
  CreateAssignmentInput,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_USERS_QUERY_KEY = ['core', 'users'] as const;

export type UserWithAssignments = AppUserResponse & { assignments?: AssignmentResponse[] };

export function useUsers(query?: ListAppUsersQuery) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: [...CORE_USERS_QUERY_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.getUsers(query);
      const items = (res.items as AppUserResponse[] | undefined) ?? [];

      // Fetch active assignments in parallel for live display of roles and scopes
      const usersWithAssignments = await Promise.all(
        items.map(async (u) => {
          try {
            const userAssignments = await client.get<AssignmentResponse[]>(
              `/admin/assignments/users/${u.id}`,
            );
            return { ...u, assignments: userAssignments };
          } catch {
            return { ...u, assignments: [] };
          }
        }),
      );

      return {
        items: usersWithAssignments,
        total: res.total ?? usersWithAssignments.length,
      };
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

  const assignScopeMutation = useMutation({
    mutationFn: async (payload: CreateAssignmentInput) => {
      const client = getApiClient();
      return client.post<AssignmentResponse>('/admin/assignments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORE_USERS_QUERY_KEY });
    },
  });

  return {
    users: usersQuery.data?.items ?? [],
    total: usersQuery.data?.total,
    isLoading: usersQuery.isLoading,
    isFetching: usersQuery.isFetching,
    error: usersQuery.error,
    refetch: usersQuery.refetch,
    createUser: createUserMutation.mutateAsync,
    isCreating: createUserMutation.isPending,
    updateUser: updateUserMutation.mutateAsync,
    isUpdating: updateUserMutation.isPending,
    assignScope: assignScopeMutation.mutateAsync,
    isAssigningScope: assignScopeMutation.isPending,
  };
}
