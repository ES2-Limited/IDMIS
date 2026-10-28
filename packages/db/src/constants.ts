import { permissions } from '@idmis/contracts';

/**
 * Well-known UUID for the internal system actor.
 * Used as created_by / updated_by for bootstrap seed rows, system background worker jobs, and imports.
 */
export const SYSTEM_USER_ID = '00000000-0000-7000-8000-000000000001';

/**
 * Well-known UUID for the seeded System Administrator role.
 */
export const ROLE_SYSTEM_ADMIN_ID = '018f3a5e-0000-7000-8000-000000000010';

export const SYSTEM_ROLES = [
  {
    id: ROLE_SYSTEM_ADMIN_ID,
    key: 'system_admin',
    name: 'System Administrator',
    description: 'Full administrative access across all modules and national scope',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000011',
    key: 'programme_manager',
    name: 'Programme Manager',
    description: 'National and RBDA-level programme management and oversight',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000012',
    key: 'module_admin',
    name: 'Module Administrator',
    description: 'Administrative control within an assigned functional module',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000013',
    key: 'scheme_data_officer',
    name: 'Scheme Data Officer',
    description: 'Scheme-level data capture, validation, and review',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000014',
    key: 'field_officer',
    name: 'Field Officer',
    description: 'Field-level mobile data capture with offline support',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000015',
    key: 'me_officer',
    name: 'M&E Officer',
    description: 'Monitoring & Evaluation data entry, survey collection, and analysis',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000016',
    key: 'basin_officer',
    name: 'Basin Officer',
    description: 'River Basin information management and dam safety records',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000017',
    key: 'procurement_officer',
    name: 'Procurement Officer',
    description: 'Procurement tracking and contract management',
    isSystem: true,
  },
  {
    id: '018f3a5e-0000-7000-8000-000000000018',
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to scoped dashboards and reports',
    isSystem: true,
  },
] as const;

/**
 * Default permission matrix for all 9 seeded system roles.
 * System roles (is_system = true) are reconciled against this matrix during seed.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  // 1. System Administrator: Explicit full core permissions (no manage:all wildcard)
  system_admin: [
    permissions.CORE_USER_READ,
    permissions.CORE_USER_CREATE,
    permissions.CORE_USER_UPDATE,
    permissions.CORE_USER_DEACTIVATE,
    permissions.CORE_RESET_PASSWORD,
    permissions.CORE_ROLE_READ,
    permissions.CORE_ROLE_MANAGE,
    permissions.CORE_ASSIGNMENT_READ,
    permissions.CORE_ASSIGNMENT_MANAGE,
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_ORGANISATION_MANAGE,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_WUA_MANAGE,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_LOOKUP_MANAGE,
    permissions.CORE_SETTING_READ,
    permissions.CORE_SETTING_MANAGE,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    permissions.CORE_IMPORT_RUN,
    permissions.CORE_AUDIT_READ,
    permissions.CORE_OUTBOX_MANAGE,
  ],

  // 2. Programme Manager: Administrative and oversight powers within assigned scope
  programme_manager: [
    permissions.CORE_USER_READ,
    permissions.CORE_USER_CREATE,
    permissions.CORE_USER_UPDATE,
    permissions.CORE_USER_DEACTIVATE,
    permissions.CORE_RESET_PASSWORD,
    permissions.CORE_ROLE_READ,
    permissions.CORE_ASSIGNMENT_READ,
    permissions.CORE_ASSIGNMENT_MANAGE,
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_ORGANISATION_MANAGE,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_WUA_MANAGE,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_LOOKUP_MANAGE,
    permissions.CORE_SETTING_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    permissions.CORE_IMPORT_RUN,
    permissions.CORE_AUDIT_READ,
  ],

  // 3. Module Administrator: Empty for now (assigned module rights added in future module PRDs)
  module_admin: [],

  // 4. Scheme Data Officer: Scheme-scoped review, data entry & WUA management
  scheme_data_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_WUA_MANAGE,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    permissions.CORE_IMPORT_RUN,
  ],

  // 5. Field Officer: Mobile field data capture with offline support
  field_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 6. M&E Officer: Indicator tracking, survey collection & reports
  me_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 7. Basin Officer: Dam safety records & river basin monitoring
  basin_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 8. Procurement Officer: Tender records & contract tracking
  procurement_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 9. Viewer: Read-only access to scoped dashboards, WUAs, geography, lookups, files
  viewer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_READ,
  ],
};
