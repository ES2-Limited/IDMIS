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

  it('marks M&E permissions as scoped', () => {
    expect(permissionKinds[permissions.ME_INDICATOR_READ]).toBe('scoped');
    expect(permissionKinds[permissions.ME_INDICATOR_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.ME_TARGET_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.ME_VALUE_SUBMIT]).toBe('scoped');
    expect(permissionKinds[permissions.ME_VALUE_APPROVE]).toBe('scoped');
    expect(permissionKinds[permissions.ME_SURVEY_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.ME_SURVEY_RESPOND]).toBe('scoped');
    expect(permissionKinds[permissions.ME_INSTRUMENTS_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.ME_ADOPTION_RECORD]).toBe('scoped');
  });

  it('marks BLIS permissions as scoped', () => {
    expect(permissionKinds[permissions.BLIS_BASIN_READ]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_BASIN_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_STATION_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_MEASUREMENT_READ]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_MEASUREMENT_IMPORT]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_DAM_MANAGE]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_INSPECTION_RECORD]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_INSPECTION_APPROVE]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_MAP_READ]).toBe('scoped');
    expect(permissionKinds[permissions.BLIS_MAP_MANAGE]).toBe('scoped');
  });
});
