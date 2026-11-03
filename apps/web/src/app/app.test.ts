import { describe, it, expect } from 'vitest';
import { defaultScopes } from '../shell/ScopeContext';
import { getMockConfig, setMockFlag } from '../mocks/config';

describe('App Shell & Routing Foundations', () => {
  it('initializes default scope choices correctly for Nigeria schemes', () => {
    expect(defaultScopes.length).toBeGreaterThan(0);
    const national = defaultScopes.find((s) => s.type === 'national');
    const scheme = defaultScopes.find((s) => s.type === 'scheme');
    expect(national).toBeDefined();
    expect(scheme).toBeDefined();
    expect(national?.name).toContain('National');
    expect(scheme?.name).toContain('Kano River');
  });

  it('manages mock configuration switches per module', () => {
    const initial = getMockConfig();
    expect(initial.auth).toBe(true);
    expect(initial.slis).toBe(true);
    expect(initial.me).toBe(true);
    expect(initial.blis).toBe(true);

    setMockFlag('slis', false);
    const updated = getMockConfig();
    expect(updated.slis).toBe(false);

    // Reset
    setMockFlag('slis', true);
    expect(getMockConfig().slis).toBe(true);
  });
});
