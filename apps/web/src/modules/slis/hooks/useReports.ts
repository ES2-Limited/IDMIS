import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  FarmersByScopeResponse,
  AreaByServiceResponse,
  CroppingResponse,
  FeeRecoveryResponse,
  WuaSummaryResponse,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const SLIS_REPORTS_KEY = ['slis', 'reports'] as const;

export function useSlisReports(schemeId?: string) {
  const { isAuthenticated } = useAuth();

  const farmersByScopeQuery = useQuery({
    queryKey: [...SLIS_REPORTS_KEY, 'farmers-by-scope', schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<FarmersByScopeResponse>(
        `/slis/reports/farmers-by-scope?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const areaByServiceQuery = useQuery({
    queryKey: [...SLIS_REPORTS_KEY, 'area-by-service', schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<AreaByServiceResponse>(
        `/slis/reports/area-by-service?${params.toString()}`,
      );
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const croppingQuery = useQuery({
    queryKey: [...SLIS_REPORTS_KEY, 'cropping', schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<CroppingResponse>(`/slis/reports/cropping?${params.toString()}`);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const feeRecoveryQuery = useQuery({
    queryKey: [...SLIS_REPORTS_KEY, 'fee-recovery', schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<FeeRecoveryResponse>(`/slis/reports/fee-recovery?${params.toString()}`);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const wuaSummariesQuery = useQuery({
    queryKey: [...SLIS_REPORTS_KEY, 'wua-summaries', schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      return client.get<WuaSummaryResponse>(`/slis/reports/wua-summaries?${params.toString()}`);
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  return {
    farmersByScope: farmersByScopeQuery.data,
    areaByService: areaByServiceQuery.data,
    cropping: croppingQuery.data,
    feeRecovery: feeRecoveryQuery.data,
    wuaSummaries: wuaSummariesQuery.data,
    isLoading:
      farmersByScopeQuery.isLoading ||
      areaByServiceQuery.isLoading ||
      croppingQuery.isLoading ||
      feeRecoveryQuery.isLoading ||
      wuaSummariesQuery.isLoading,
  };
}
