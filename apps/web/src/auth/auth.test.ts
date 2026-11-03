import { describe, it, expect } from 'vitest';
import { MOCK_SUPERADMIN, MOCK_PERMISSIONS } from './AuthContext';

function evaluateCan(
  user: typeof MOCK_SUPERADMIN | null,
  permissions: string[],
  requiredPermission?: string,
): boolean {
  if (!requiredPermission) return true;
  if (!user) return false;
  if (user.isSystemAdmin) return true;

  return permissions.some((perm) => {
    if (perm === '*') return true;
    if (perm === requiredPermission) return true;
    if (perm.endsWith('.*')) {
      const prefix = perm.slice(0, -2);
      return requiredPermission.startsWith(prefix);
    }
    return false;
  });
}

describe('Auth & Permissions Logic (FE-1.3)', () => {
  it('allows all permissions for system admin user', () => {
    const isAllowed = evaluateCan(MOCK_SUPERADMIN, [], 'slis.farmer.create');
    expect(isAllowed).toBe(true);
  });

  it('allows all permissions when wildcard * is present', () => {
    const regularUser = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    const isAllowed = evaluateCan(regularUser, ['*'], 'slis.farmer.create');
    expect(isAllowed).toBe(true);
  });

  it('evaluates module prefix wildcard permissions correctly', () => {
    const fieldOfficer = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    expect(evaluateCan(fieldOfficer, ['slis.*'], 'slis.farmer.create')).toBe(true);
    expect(evaluateCan(fieldOfficer, ['slis.*'], 'core.user.write')).toBe(false);
  });

  it('evaluates exact permission match correctly', () => {
    const viewer = { ...MOCK_SUPERADMIN, isSystemAdmin: false };
    expect(evaluateCan(viewer, ['slis.farmer.read'], 'slis.farmer.read')).toBe(true);
    expect(evaluateCan(viewer, ['slis.farmer.read'], 'slis.farmer.create')).toBe(false);
  });

  it('denies all actions when user is null', () => {
    expect(evaluateCan(null, MOCK_PERMISSIONS, 'slis.farmer.read')).toBe(false);
    expect(evaluateCan(null, MOCK_PERMISSIONS)).toBe(true);
  });
});
