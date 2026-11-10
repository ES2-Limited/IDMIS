import * as React from 'react';
import { useGeography, useOrganisations } from '../modules/core/hooks';

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
  {
    type: 'scheme',
    id: '018f3a5e-0020-7000-8000-000000000001',
    name: 'Kano River Irrigation Scheme (KRIS)',
  },
];

const ScopeContext = React.createContext<ScopeState | undefined>(undefined);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [currentScope, setCurrentScope] = React.useState<ScopeSelection>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('idmis_selected_scope');
        if (saved) return JSON.parse(saved);
      } catch {
        // fallback to default
      }
    }
    return defaultScopes[0]!;
  });

  // Query live states and organisations from server via clean modular hooks
  const { states: statesData, isLoadingStates } = useGeography();
  const { organisations: orgsData, isLoading: isLoadingOrgs } = useOrganisations();

  const isLoadingScopes = isLoadingStates || isLoadingOrgs;

  // Merge live server states and schemes into available scopes
  const availableScopes = React.useMemo(() => {
    const list: ScopeSelection[] = [defaultScopes[0]!];

    if (statesData && statesData.length > 0) {
      statesData.forEach((s) => {
        list.push({
          type: 'state',
          id: s.id,
          name: `${s.name} State`,
        });
      });
    }

    if (orgsData && orgsData.length > 0) {
      orgsData
        .filter((o) => o.type === 'scheme')
        .forEach((scheme) => {
          list.push({
            type: 'scheme',
            id: scheme.id,
            name: scheme.name,
          });
        });
    }

    return list;
  }, [statesData, orgsData]);

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

const defaultScopeValue: ScopeState = {
  currentScope: defaultScopes[0]!,
  setScope: () => {},
  availableScopes: defaultScopes,
  isLoadingScopes: false,
};

export function useScope(): ScopeState {
  const ctx = React.useContext(ScopeContext);
  if (!ctx) {
    return defaultScopeValue;
  }
  return ctx;
}
