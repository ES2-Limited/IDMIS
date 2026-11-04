import * as React from 'react';
import { useAuth } from '../auth';

export interface FieldModeContextValue {
  isFieldCollector: boolean;
  canCaptureOffline: boolean;
  toggleFieldModeOverride: () => void;
  isFieldLayoutActive: boolean;
}

const FieldModeContext = React.createContext<FieldModeContextValue | null>(null);

const STORAGE_OVERRIDE_KEY = 'idmis_field_mode_override';

export function FieldModeProvider({ children }: { children: React.ReactNode }) {
  const { user, permissions } = useAuth();
  const [manualOverride, setManualOverride] = React.useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_OVERRIDE_KEY);
      return stored ? stored === 'true' : null;
    }
    return null;
  });

  // A user qualifies as an offline field collector if:
  // 1. They have 'offline.capture' or 'slis.farmer.create' or 'slis.plot.manage' permission
  // 2. OR user roles include field collector / enumerator / field_officer
  // 3. User object has canCaptureOffline flag or system admin override
  const canCaptureOffline = React.useMemo(() => {
    if (!user) return false;
    const hasRole = user.roles.some((r) =>
      ['field_collector', 'enumerator', 'data_collector', 'wua_officer'].includes(r.toLowerCase()),
    );
    const hasPerm =
      permissions.includes('*') ||
      permissions.includes('slis.farmer.create') ||
      permissions.includes('offline.capture') ||
      permissions.includes('slis.sync.push');
    return hasRole || hasPerm;
  }, [user, permissions]);

  const toggleFieldModeOverride = React.useCallback(() => {
    setManualOverride((prev) => {
      const next = prev === null ? !canCaptureOffline : !prev;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_OVERRIDE_KEY, String(next));
      }
      return next;
    });
  }, [canCaptureOffline]);

  // Field layout is active if:
  // - Manual override is explicitly enabled OR
  // - (Manual override is not set AND user is field collector / has offline capture)
  const isFieldLayoutActive = manualOverride !== null ? manualOverride : canCaptureOffline;

  return (
    <FieldModeContext.Provider
      value={{
        isFieldCollector: canCaptureOffline,
        canCaptureOffline,
        toggleFieldModeOverride,
        isFieldLayoutActive,
      }}
    >
      {children}
    </FieldModeContext.Provider>
  );
}

export function useFieldMode() {
  const context = React.useContext(FieldModeContext);
  if (!context) {
    return {
      isFieldCollector: false,
      canCaptureOffline: false,
      toggleFieldModeOverride: () => {},
      isFieldLayoutActive: false,
    };
  }
  return context;
}
