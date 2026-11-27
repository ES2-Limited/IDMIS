import { describe, it, expect } from 'vitest';
import { MOCK_SUPERADMIN, MOCK_PERMISSIONS } from './AuthContext';
import { hasPermission } from './useCan';

describe('Auth & Permissions Logic (FE-1.3)', () => {
  it('allows all permissions for system admin user', () => {
    const isAllowed = hasPermission(MOCK_SUPERADMIN, [], 'slis.farmer.create');
    expect(isAllowed).toBe(true);
  });

  it('allows all permissions when wildcard * is present', () => {
    const regularUser = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    const isAllowed = hasPermission(regularUser, ['*'], 'slis.farmer.create');
    expect(isAllowed).toBe(true);
  });

  it('evaluates module prefix wildcard permissions correctly', () => {
    const fieldOfficer = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    expect(hasPermission(fieldOfficer, ['slis.*'], 'slis.farmer.create')).toBe(true);
    expect(hasPermission(fieldOfficer, ['slis.*'], 'core.user.write')).toBe(false);
  });

  it('evaluates exact permission match correctly', () => {
    const viewer = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    expect(hasPermission(viewer, ['slis.farmer.read'], 'slis.farmer.read')).toBe(true);
    expect(hasPermission(viewer, ['slis.farmer.read'], 'slis.farmer.create')).toBe(false);
  });

  it('evaluates array (any-of) permissions and isolates modules', () => {
    const meOfficer = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    const mePerms = ['me.indicator.read', 'me.value.submit'];
    expect(hasPermission(meOfficer, mePerms, ['me.indicator.read', 'me.survey.manage'])).toBe(true);
    expect(hasPermission(meOfficer, mePerms, ['slis.farmer.read', 'slis.plot.read'])).toBe(false);
    expect(hasPermission(meOfficer, mePerms, ['blis.basin.read', 'blis.map.read'])).toBe(false);
    expect(hasPermission(meOfficer, mePerms, ['core.user.read'])).toBe(false);
  });

  it('denies all actions when user is null', () => {
    expect(hasPermission(null, MOCK_PERMISSIONS, 'slis.farmer.read')).toBe(false);
    expect(hasPermission(null, MOCK_PERMISSIONS)).toBe(true);
  });
});
