import * as React from 'react';
import { useOrganisations } from './useOrganisations';

export function useEffectiveSchemeId(scopeSchemeId?: string | null): {
  schemeId: string;
  schemeName: string;
  schemes: Array<{ id: string; name: string }>;
  isLoading: boolean;
  setSchemeId: (id: string) => void;
} {
  const { organisations = [], isLoading } = useOrganisations({ type: 'scheme' });
  const schemes = React.useMemo(
    () =>
      organisations
        .filter((o) => o.type === 'scheme')
        .map((s) => ({ id: s.id, name: s.name })),
    [organisations],
  );

  const [selectedSchemeId, setSelectedSchemeId] = React.useState<string>('');

  React.useEffect(() => {
    const isUuid =
      scopeSchemeId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        scopeSchemeId,
      );
    if (isUuid) {
      setSelectedSchemeId(scopeSchemeId);
    } else if (!selectedSchemeId && schemes.length > 0) {
      setSelectedSchemeId(schemes[0]!.id);
    }
  }, [scopeSchemeId, schemes, selectedSchemeId]);

  const activeScheme = schemes.find((s) => s.id === selectedSchemeId) ?? schemes[0];

  return {
    schemeId: activeScheme?.id || '018f3a5e-0020-7000-8000-000000000001',
    schemeName: activeScheme?.name || 'Kano River Irrigation Scheme',
    schemes,
    isLoading,
    setSchemeId: setSelectedSchemeId,
  };
}

