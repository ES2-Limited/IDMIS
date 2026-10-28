export const permissions = {
  // Core: Users
  CORE_USER_READ: 'core.user.read',
  CORE_USER_CREATE: 'core.user.create',
  CORE_USER_UPDATE: 'core.user.update',
  CORE_USER_DEACTIVATE: 'core.user.deactivate',
  CORE_RESET_PASSWORD: 'core.reset_password',

  // Core: Roles & Assignments
  CORE_ROLE_READ: 'core.role.read',
  CORE_ROLE_MANAGE: 'core.role.manage',
  CORE_ASSIGNMENT_READ: 'core.assignment.read',
  CORE_ASSIGNMENT_MANAGE: 'core.assignment.manage',

  // Core: Organisations
  CORE_ORGANISATION_READ: 'core.organisation.read',
  CORE_ORGANISATION_MANAGE: 'core.organisation.manage',

  // Core: WUAs
  CORE_WUA_READ: 'core.wua.read',
  CORE_WUA_MANAGE: 'core.wua.manage',

  // Core: Geography
  CORE_GEOGRAPHY_READ: 'core.geography.read',

  // Core: Lookups & Settings
  CORE_LOOKUP_READ: 'core.lookup.read',
  CORE_LOOKUP_MANAGE: 'core.lookup.manage',
  CORE_SETTING_READ: 'core.setting.read',
  CORE_SETTING_MANAGE: 'core.setting.manage',

  // Core: Files
  CORE_FILE_UPLOAD: 'core.file.upload',
  CORE_FILE_READ: 'core.file.read',

  // Core: Imports & Audit
  CORE_IMPORT_RUN: 'core.import.run',
  CORE_AUDIT_READ: 'core.audit.read',

  // Core: Outbox
  CORE_OUTBOX_MANAGE: 'core.outbox.manage',
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

export type PermissionKind = 'scoped' | 'global';

export const permissionKinds: Record<Permission, PermissionKind> = {
  [permissions.CORE_USER_READ]: 'scoped',
  [permissions.CORE_USER_CREATE]: 'scoped',
  [permissions.CORE_USER_UPDATE]: 'scoped',
  [permissions.CORE_USER_DEACTIVATE]: 'scoped',
  [permissions.CORE_RESET_PASSWORD]: 'scoped',
  [permissions.CORE_ROLE_READ]: 'scoped',
  [permissions.CORE_ROLE_MANAGE]: 'global',
  [permissions.CORE_ASSIGNMENT_READ]: 'scoped',
  [permissions.CORE_ASSIGNMENT_MANAGE]: 'scoped',
  [permissions.CORE_ORGANISATION_READ]: 'scoped',
  [permissions.CORE_ORGANISATION_MANAGE]: 'scoped',
  [permissions.CORE_GEOGRAPHY_READ]: 'scoped',
  [permissions.CORE_WUA_READ]: 'scoped',
  [permissions.CORE_WUA_MANAGE]: 'scoped',
  [permissions.CORE_LOOKUP_READ]: 'scoped',
  [permissions.CORE_LOOKUP_MANAGE]: 'global',
  [permissions.CORE_SETTING_READ]: 'global',
  [permissions.CORE_SETTING_MANAGE]: 'global',
  [permissions.CORE_FILE_UPLOAD]: 'scoped',
  [permissions.CORE_FILE_READ]: 'scoped',
  [permissions.CORE_IMPORT_RUN]: 'scoped',
  [permissions.CORE_AUDIT_READ]: 'global',
  [permissions.CORE_OUTBOX_MANAGE]: 'global',
};
