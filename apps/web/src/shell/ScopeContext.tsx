import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@idmis/api-client';
import { useAuth } from '../auth';

export type ScopeType = 'national' | 'state' | 'rbda' | 'scheme' | 'sector';

export interface ScopeSelection {
  type: ScopeType;
  id: string;
  name: string;
}

export interface ScopeState {
  currentScope: ScopeSelection;
  setScope: (scope: ScopeSelection) => void;
  availableScopes: ScopeSelection[];
  isLoadingScopes?: boolean;
}

export const defaultScopes: ScopeSelection[] = [
  { type: 'national', id: 'national-all', name: 'National (All Nigeria)' },
  { type: 'state', id: 'state-kano', name: 'Kano State' },
  { type: 'state', id: 'state-kaduna', name: 'Kaduna State' },
  { type: 'scheme', id: 'scheme-kris', name: 'Kano River Irrigation Scheme (KRIS)' },
  { type: 'scheme', id: 'scheme-bada', name: 'Bakolori Irrigation Scheme (BIS)' },
  { type: 'scheme', id: 'scheme-hadejia', name: 'Hadejia Valley Irrigation Project (HVIP)' },
];

const ScopeContext = React.createContext<ScopeState | undefined>(undefined);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [currentScope, setCurrentScope] = React.useState<ScopeSelection>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('idmis_selected_scope');
        if (saved) return JSON.parse(saved);
      } catch {
        // fallback to default
      }
    }
    return defaultScopes[0];
  });

  // Query live states from server via getApiClient only when authenticated
  const { data: statesData, isLoading: isLoadingScopes } = useQuery({
    queryKey: ['geography', 'states'],
    queryFn: async () => {
      const client = getApiClient();
      return client.getStates();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 60, // 1 hour cache
    retry: 1,
  });

  // Merge live server states into available scopes
  const availableScopes = React.useMemo(() => {
    if (!statesData?.items || statesData.items.length === 0) {
      return defaultScopes;
    }
    const serverStateScopes: ScopeSelection[] = statesData.items.map((s) => ({
      type: 'state' as const,
      id: s.id,
      name: `${s.name} State`,
    }));

    return [
      defaultScopes[0]!, // National
      ...serverStateScopes,
      ...defaultScopes.filter((s) => s.type === 'scheme'),
    ];
  }, [statesData]);

  const setScope = React.useCallback((scope: ScopeSelection) => {
    setCurrentScope(scope);
    if (typeof window !== 'undefined') {
      localStorage.setItem('idmis_selected_scope', JSON.stringify(scope));
    }
  }, []);

  return (
    <ScopeContext.Provider
      value={{
        currentScope,
        setScope,
        availableScopes,
        isLoadingScopes,
      }}
    >
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope(): ScopeState {
  const ctx = React.useContext(ScopeContext);
  if (!ctx) {
    throw new Error('useScope must be used within a ScopeProvider');
  }
  return ctx;
}
