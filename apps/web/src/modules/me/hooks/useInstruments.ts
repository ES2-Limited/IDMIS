import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import type {
  Scorecard,
  CreateScorecardInput,
  MatchingGrant,
  CreateMatchingGrantInput,
  TechAdoption,
  Survey,
  CreateSurveyInput,
} from '@idmis/contracts';
import { useAuth } from '../../../auth';

export const ME_SCORECARDS_KEY = ['me', 'scorecards'] as const;
export const ME_GRANTS_KEY = ['me', 'matching-grants'] as const;
export const ME_TECH_ADOPTION_KEY = ['me', 'tech-adoption'] as const;
export const ME_SURVEYS_KEY = ['me', 'surveys'] as const;

export function useScorecards(schemeId?: string, periodYear?: number) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const scorecardsQuery = useQuery({
    queryKey: [...ME_SCORECARDS_KEY, schemeId, periodYear],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      if (periodYear) params.set('periodYear', String(periodYear));
      const res = await client.get<Scorecard[] | { data: Scorecard[]; total: number }>(
        `/me/scorecards?${params.toString()}`,
      );
      if (Array.isArray(res)) return res;
      return res?.data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createScorecardMutation = useMutation({
    mutationFn: async (payload: CreateScorecardInput) => {
      const client = getApiClient();
      return client.post<Scorecard>('/me/scorecards', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_SCORECARDS_KEY });
    },
  });

  return {
    scorecards: scorecardsQuery.data ?? [],
    isLoading: scorecardsQuery.isLoading,
    isFetching: scorecardsQuery.isFetching,
    error: scorecardsQuery.error,
    refetch: scorecardsQuery.refetch,
    createScorecard: createScorecardMutation.mutateAsync,
    isCreating: createScorecardMutation.isPending,
  };
}

export function useMatchingGrants(schemeId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const grantsQuery = useQuery({
    queryKey: [...ME_GRANTS_KEY, schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      const res = await client.get<MatchingGrant[] | { data: MatchingGrant[]; total: number }>(
        `/me/grants?${params.toString()}`,
      );
      if (Array.isArray(res)) return res;
      return res?.data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createGrantMutation = useMutation({
    mutationFn: async (payload: CreateMatchingGrantInput) => {
      const client = getApiClient();
      return client.post<MatchingGrant>('/me/grants', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_GRANTS_KEY });
    },
  });

  return {
    grants: grantsQuery.data ?? [],
    isLoading: grantsQuery.isLoading,
    isFetching: grantsQuery.isFetching,
    error: grantsQuery.error,
    refetch: grantsQuery.refetch,
    createGrant: createGrantMutation.mutateAsync,
    isCreating: createGrantMutation.isPending,
  };
}

export function useTechAdoption(schemeId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const techQuery = useQuery({
    queryKey: [...ME_TECH_ADOPTION_KEY, schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      const res = await client.get<TechAdoption[] | { data: TechAdoption[]; total: number }>(
        `/me/tech-adoption?${params.toString()}`,
      );
      if (Array.isArray(res)) return res;
      return res?.data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createTechAdoptionMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const client = getApiClient();
      return client.post<TechAdoption>('/me/tech-adoption', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_TECH_ADOPTION_KEY });
    },
  });

  return {
    adoptions: techQuery.data ?? [],
    isLoading: techQuery.isLoading,
    isFetching: techQuery.isFetching,
    error: techQuery.error,
    refetch: techQuery.refetch,
    createTechAdoption: createTechAdoptionMutation.mutateAsync,
    isCreating: createTechAdoptionMutation.isPending,
  };
}

export function useSurveys(schemeId?: string) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const surveysQuery = useQuery({
    queryKey: [...ME_SURVEYS_KEY, schemeId],
    queryFn: async () => {
      const client = getApiClient();
      const params = new URLSearchParams();
      if (schemeId) params.set('schemeId', schemeId);
      const res = await client.get<Survey[] | { items?: Survey[]; data?: Survey[]; total: number }>(
        `/me/surveys?${params.toString()}`,
      );
      if (Array.isArray(res)) return res;
      if (res && 'items' in res && Array.isArray(res.items)) return res.items;
      if (res && 'data' in res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const createSurveyMutation = useMutation({
    mutationFn: async (payload: CreateSurveyInput) => {
      const client = getApiClient();
      return client.post<Survey>('/me/surveys', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_SURVEYS_KEY });
    },
  });

  return {
    surveys: surveysQuery.data ?? [],
    isLoading: surveysQuery.isLoading,
    isFetching: surveysQuery.isFetching,
    error: surveysQuery.error,
    refetch: surveysQuery.refetch,
    createSurvey: createSurveyMutation.mutateAsync,
    isCreating: createSurveyMutation.isPending,
  };
}
