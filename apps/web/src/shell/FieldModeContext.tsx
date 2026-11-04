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
  const { user } = useAuth();
  const [manualOverride, setManualOverride] = React.useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_OVERRIDE_KEY);
      return stored ? stored === 'true' : null;
    }
    return null;
  });

  // A user qualifies as an offline field collector if their active assignment explicitly has
  // canCaptureOffline or they are in field roles.
  // Superadmin / office staff default to standard desktop workspace unless explicitly in field mode.
  const canCaptureOffline = React.useMemo(() => {
    if (!user) return false;
    const isFieldRole = user.roles.some((r) =>
      ['field_collector', 'enumerator', 'data_collector', 'wua_officer'].includes(r.toLowerCase()),
    );
    return isFieldRole;
  }, [user]);

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
  // - User manually toggled field mode ON OR
  // - User is genuinely a field collector (and hasn't manually opted out)
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
