export const permissions = {
  // Core: Users
  CORE_USER_READ: 'core.user.read',
  CORE_USER_CREATE: 'core.user.create',
  CORE_USER_UPDATE: 'core.user.update',
  CORE_USER_DEACTIVATE: 'core.user.deactivate',

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
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];
