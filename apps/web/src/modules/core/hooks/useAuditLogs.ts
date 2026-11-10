import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type { AuditLogResponse, ListAuditLogsQuery } from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const CORE_AUDIT_LOGS_KEY = ['core', 'audit-logs'] as const;

export function useAuditLogs(query?: ListAuditLogsQuery) {
  const { isAuthenticated } = useAuth();

  const auditQuery = useQuery({
    queryKey: [...CORE_AUDIT_LOGS_KEY, query],
    queryFn: async () => {
      const client = getApiClient();
      return client.getAuditLogs(query as Record<string, unknown>);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });

  return {
    logs: (auditQuery.data?.items as AuditLogResponse[] | undefined) ?? [],
    total: auditQuery.data?.total ?? 0,
    isLoading: auditQuery.isLoading,
    isFetching: auditQuery.isFetching,
    error: auditQuery.error,
    refetch: auditQuery.refetch,
  };
}

