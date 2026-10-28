import { describe, it, expect } from 'vitest';
import { permissions, permissionKinds } from './permissions';

describe('permissions', () => {
  it('should be defined', () => {
    expect(permissions).toBeDefined();
  });

  it('classifies every permission as either scoped or global', () => {
    const allPerms = Object.values(permissions);
    expect(allPerms.length).toBeGreaterThan(0);

    for (const perm of allPerms) {
      expect(permissionKinds[perm]).toBeDefined();
      expect(['scoped', 'global']).toContain(permissionKinds[perm]);
    }
  });

  it('correctly marks global management permissions', () => {
    expect(permissionKinds[permissions.CORE_LOOKUP_MANAGE]).toBe('global');
    expect(permissionKinds[permissions.CORE_SETTING_READ]).toBe('global');
    expect(permissionKinds[permissions.CORE_SETTING_MANAGE]).toBe('global');
    expect(permissionKinds[permissions.CORE_ROLE_MANAGE]).toBe('global');
    expect(permissionKinds[permissions.CORE_AUDIT_READ]).toBe('global');
    expect(permissionKinds[permissions.CORE_OUTBOX_MANAGE]).toBe('global');
  });

  it('marks core operational data permissions as scoped', () => {
    expect(permissionKinds[permissions.CORE_WUA_READ]).toBe('scoped');
    expect(permissionKinds[permissions.CORE_WUA_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.CORE_USER_READ]).toBe('scoped');
    expect(permissionKinds[permissions.CORE_RESET_PASSWORD]).toBe('scoped');
  });
});
