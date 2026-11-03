import * as React from 'react';

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
        availableScopes: defaultScopes,
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
