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
export const ROLE_SLIS_ADMIN_ID = '018f3a5e-0000-7000-8000-000000000019';

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
    id: ROLE_SLIS_ADMIN_ID,
    key: 'slis_admin',
    name: 'SLIS Administrator',
    description: 'Module administrator with full control over SLIS features, records, and imports',
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
 * Default permission matrix for all 10 seeded system roles.
 * System roles (is_system = true) are reconciled against this matrix during seed.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  // 1. System Administrator: Full administrative control across core and SLIS
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
    // SLIS
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_FARMER_CREATE,
    permissions.SLIS_FARMER_UPDATE,
    permissions.SLIS_FARMER_DELETE,
    permissions.SLIS_IDENTITY_VIEW,
    permissions.SLIS_HOUSEHOLD_MANAGE,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_PLOT_MANAGE,
    permissions.SLIS_ALLOCATION_MANAGE,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_WATER_REQUEST_CREATE,
    permissions.SLIS_WATER_REQUEST_DECIDE,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_FEE_RECORD,
    permissions.SLIS_CROP_MANAGE,
    permissions.SLIS_TRAINING_MANAGE,
    permissions.SLIS_STREAM_FLOW_RECORD,
    permissions.SLIS_REVIEW_SUBMIT,
    permissions.SLIS_REVIEW_APPROVE,
    permissions.SLIS_SYNC_PUSH,
    permissions.SLIS_SYNC_PULL,
    permissions.SLIS_SYNC_CONFLICT_RESOLVE,
    permissions.SLIS_IMPORT_RUN,
    permissions.SLIS_REPORT_READ,
    permissions.SLIS_EXPORT_GENERATE,
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
    // SLIS Oversight
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_REPORT_READ,
    permissions.SLIS_EXPORT_GENERATE,
  ],

  // 3. Module Administrator: Generic placeholder (specific module admins use dedicated roles)
  module_admin: [],

  // 4. SLIS Administrator: Explicit permissions for SLIS module administration
  slis_admin: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_WUA_MANAGE,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_LOOKUP_MANAGE,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    permissions.CORE_IMPORT_RUN,
    permissions.CORE_AUDIT_READ,
    // SLIS
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_FARMER_CREATE,
    permissions.SLIS_FARMER_UPDATE,
    permissions.SLIS_FARMER_DELETE,
    permissions.SLIS_IDENTITY_VIEW,
    permissions.SLIS_HOUSEHOLD_MANAGE,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_PLOT_MANAGE,
    permissions.SLIS_ALLOCATION_MANAGE,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_WATER_REQUEST_CREATE,
    permissions.SLIS_WATER_REQUEST_DECIDE,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_FEE_RECORD,
    permissions.SLIS_CROP_MANAGE,
    permissions.SLIS_TRAINING_MANAGE,
    permissions.SLIS_STREAM_FLOW_RECORD,
    permissions.SLIS_REVIEW_SUBMIT,
    permissions.SLIS_REVIEW_APPROVE,
    permissions.SLIS_SYNC_PUSH,
    permissions.SLIS_SYNC_PULL,
    permissions.SLIS_SYNC_CONFLICT_RESOLVE,
    permissions.SLIS_IMPORT_RUN,
    permissions.SLIS_REPORT_READ,
    permissions.SLIS_EXPORT_GENERATE,
  ],

  // 5. Scheme Data Officer: Scheme-level review, approval, validation & full scheme operations
  scheme_data_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_WUA_MANAGE,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    permissions.CORE_IMPORT_RUN,
    // SLIS
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_FARMER_CREATE,
    permissions.SLIS_FARMER_UPDATE,
    permissions.SLIS_HOUSEHOLD_MANAGE,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_PLOT_MANAGE,
    permissions.SLIS_ALLOCATION_MANAGE,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_WATER_REQUEST_CREATE,
    permissions.SLIS_WATER_REQUEST_DECIDE,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_FEE_RECORD,
    permissions.SLIS_CROP_MANAGE,
    permissions.SLIS_TRAINING_MANAGE,
    permissions.SLIS_STREAM_FLOW_RECORD,
    permissions.SLIS_REVIEW_SUBMIT,
    permissions.SLIS_REVIEW_APPROVE,
    permissions.SLIS_SYNC_PUSH,
    permissions.SLIS_SYNC_PULL,
    permissions.SLIS_SYNC_CONFLICT_RESOLVE,
    permissions.SLIS_IMPORT_RUN,
    permissions.SLIS_REPORT_READ,
  ],

  // 6. Field Officer: Mobile field data capture with offline support (cannot approve)
  field_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    // SLIS
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_FARMER_CREATE,
    permissions.SLIS_FARMER_UPDATE,
    permissions.SLIS_HOUSEHOLD_MANAGE,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_PLOT_MANAGE,
    permissions.SLIS_ALLOCATION_MANAGE,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_WATER_REQUEST_CREATE,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_FEE_RECORD,
    permissions.SLIS_CROP_MANAGE,
    permissions.SLIS_TRAINING_MANAGE,
    permissions.SLIS_STREAM_FLOW_RECORD,
    permissions.SLIS_REVIEW_SUBMIT,
    permissions.SLIS_SYNC_PUSH,
    permissions.SLIS_SYNC_PULL,
  ],

  // 7. M&E Officer: Monitoring & Evaluation data entry, survey collection, and analysis
  me_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
    // SLIS
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_REPORT_READ,
    permissions.SLIS_EXPORT_GENERATE,
  ],

  // 8. Basin Officer: Dam safety records & river basin monitoring
  basin_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 9. Procurement Officer: Tender records & contract tracking
  procurement_officer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_UPLOAD,
    permissions.CORE_FILE_READ,
  ],

  // 10. Viewer: Read-only access to scoped dashboards, WUAs, geography, lookups, files
  viewer: [
    permissions.CORE_ORGANISATION_READ,
    permissions.CORE_GEOGRAPHY_READ,
    permissions.CORE_WUA_READ,
    permissions.CORE_LOOKUP_READ,
    permissions.CORE_FILE_READ,
    // SLIS Read-only
    permissions.SLIS_FARMER_READ,
    permissions.SLIS_PLOT_READ,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_FEE_READ,
    permissions.SLIS_REPORT_READ,
  ],
};
