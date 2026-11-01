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

  // SLIS: Farmers & Households
  SLIS_FARMER_READ: 'slis.farmer.read',
  SLIS_FARMER_CREATE: 'slis.farmer.create',
  SLIS_FARMER_UPDATE: 'slis.farmer.update',
  SLIS_FARMER_DELETE: 'slis.farmer.delete',
  SLIS_IDENTITY_VIEW: 'slis.identity.view',
  SLIS_HOUSEHOLD_MANAGE: 'slis.household.manage',

  // SLIS: Plots, Farms & Allocations
  SLIS_PLOT_READ: 'slis.plot.read',
  SLIS_PLOT_MANAGE: 'slis.plot.manage',
  SLIS_ALLOCATION_MANAGE: 'slis.allocation.manage',

  // SLIS: Operations (Water, Fees, Crops, Trainings, Stream Flow)
  SLIS_WATER_REQUEST_READ: 'slis.water_request.read',
  SLIS_WATER_REQUEST_CREATE: 'slis.water_request.create',
  SLIS_WATER_REQUEST_DECIDE: 'slis.water_request.decide',
  SLIS_FEE_READ: 'slis.fee.read',
  SLIS_FEE_RECORD: 'slis.fee.record',
  SLIS_CROP_MANAGE: 'slis.crop.manage',
  SLIS_TRAINING_MANAGE: 'slis.training.manage',
  SLIS_STREAM_FLOW_RECORD: 'slis.stream_flow.record',

  // SLIS: Review & Approval Workflow
  SLIS_REVIEW_SUBMIT: 'slis.review.submit',
  SLIS_REVIEW_APPROVE: 'slis.review.approve',

  // SLIS: Sync Engine
  SLIS_SYNC_PUSH: 'slis.sync.push',
  SLIS_SYNC_PULL: 'slis.sync.pull',
  SLIS_SYNC_CONFLICT_RESOLVE: 'slis.sync.conflict_resolve',

  // SLIS: Imports & Reports
  SLIS_IMPORT_RUN: 'slis.import.run',
  SLIS_REPORT_READ: 'slis.report.read',
  SLIS_REPORT_VIEW: 'slis.report.view',
  SLIS_EXPORT_GENERATE: 'slis.export.generate',
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

  // SLIS permissions (all strictly scoped)
  [permissions.SLIS_FARMER_READ]: 'scoped',
  [permissions.SLIS_FARMER_CREATE]: 'scoped',
  [permissions.SLIS_FARMER_UPDATE]: 'scoped',
  [permissions.SLIS_FARMER_DELETE]: 'scoped',
  [permissions.SLIS_IDENTITY_VIEW]: 'scoped',
  [permissions.SLIS_HOUSEHOLD_MANAGE]: 'scoped',
  [permissions.SLIS_PLOT_READ]: 'scoped',
  [permissions.SLIS_PLOT_MANAGE]: 'scoped',
  [permissions.SLIS_ALLOCATION_MANAGE]: 'scoped',
  [permissions.SLIS_WATER_REQUEST_READ]: 'scoped',
  [permissions.SLIS_WATER_REQUEST_CREATE]: 'scoped',
  [permissions.SLIS_WATER_REQUEST_DECIDE]: 'scoped',
  [permissions.SLIS_FEE_READ]: 'scoped',
  [permissions.SLIS_FEE_RECORD]: 'scoped',
  [permissions.SLIS_CROP_MANAGE]: 'scoped',
  [permissions.SLIS_TRAINING_MANAGE]: 'scoped',
  [permissions.SLIS_STREAM_FLOW_RECORD]: 'scoped',
  [permissions.SLIS_REVIEW_SUBMIT]: 'scoped',
  [permissions.SLIS_REVIEW_APPROVE]: 'scoped',
  [permissions.SLIS_SYNC_PUSH]: 'scoped',
  [permissions.SLIS_SYNC_PULL]: 'scoped',
  [permissions.SLIS_SYNC_CONFLICT_RESOLVE]: 'scoped',
  [permissions.SLIS_IMPORT_RUN]: 'scoped',
  [permissions.SLIS_REPORT_READ]: 'scoped',
  [permissions.SLIS_REPORT_VIEW]: 'scoped',
  [permissions.SLIS_EXPORT_GENERATE]: 'scoped',
};
