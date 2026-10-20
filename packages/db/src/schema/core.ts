import {
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  jsonb,
  timestamp,
  date,
  primaryKey,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  ORG_TYPES,
  WUA_LEVELS,
  SCOPE_TYPES,
  RECORD_STATUSES,
  MODULE_KEYS,
  WUA_OFFICES,
  FILE_SCAN_STATUSES,
} from '@idmis/contracts';
import {
  citext,
  bytea,
  geometryMultiPolygon,
  geometryGeneric,
  standardColumns,
  standardUserColumns,
} from './common';

export const coreSchema = pgSchema('core');

// Enums built from contract enum arrays
export const orgTypeEnum = coreSchema.enum('org_type', ORG_TYPES);
export const wuaLevelEnum = coreSchema.enum('wua_level', WUA_LEVELS);
export const scopeTypeEnum = coreSchema.enum('scope_type', SCOPE_TYPES);
export const recordStatusEnum = coreSchema.enum('record_status', RECORD_STATUSES);
export const moduleKeyEnum = coreSchema.enum('module_key', MODULE_KEYS);
export const wuaOfficeEnum = coreSchema.enum('wua_office', WUA_OFFICES);
export const fileScanStatusEnum = coreSchema.enum('file_scan_status', FILE_SCAN_STATUSES);

// --- Access: App User ---
export const appUser = coreSchema.table('app_user', {
  ...standardUserColumns((): AnyPgColumn => appUser.id),
  email: citext('email').notNull().unique(),
  username: citext('username').unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  totpSecretEnc: bytea('totp_secret_enc'),
  isActive: boolean('is_active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  failedSignIns: integer('failed_sign_ins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'string' }),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true, mode: 'string' }),
});

// --- Geography ---
export const state = coreSchema.table('state', {
  ...standardColumns((): AnyPgColumn => appUser.id),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  geom: geometryMultiPolygon('geom'),
});

export const lga = coreSchema.table(
  'lga',
  {
    id: uuid('id').primaryKey(),
    stateId: uuid('state_id')
      .notNull()
      .references(() => state.id),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    geom: geometryMultiPolygon('geom'),
  },
  (table) => [index('lga_state_id_idx').on(table.stateId)],
);

export const ward = coreSchema.table(
  'ward',
  {
    id: uuid('id').primaryKey(),
    lgaId: uuid('lga_id')
      .notNull()
      .references(() => lga.id),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    geom: geometryMultiPolygon('geom'),
  },
  (table) => [index('ward_lga_id_idx').on(table.lgaId)],
);

// --- Organisations ---
export const organisation = coreSchema.table(
  'organisation',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    type: orgTypeEnum('type').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => organisation.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name'),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    geom: geometryGeneric('geom'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    index('organisation_parent_id_idx').on(table.parentId),
    uniqueIndex('organisation_code_active_unique')
      .on(table.code)
      .where(sql`"deleted_at" IS NULL`),
  ],
);

export const organisationState = coreSchema.table(
  'organisation_state',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisation.id),
    stateId: uuid('state_id')
      .notNull()
      .references(() => state.id),
  },
  (table) => [primaryKey({ columns: [table.organisationId, table.stateId] })],
);

// --- Water Users Associations ---
export const wua = coreSchema.table(
  'wua',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    level: wuaLevelEnum('level').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => wua.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisation.id),
    wardId: uuid('ward_id').references(() => ward.id),
    regNo: text('reg_no'),
    name: text('name').notNull(),
    address: text('address'),
    bankName: text('bank_name'),
    bankAccountEnc: bytea('bank_account_enc'),
    isOperational: boolean('is_operational').notNull().default(false),
    hasMaintenanceFund: boolean('has_maintenance_fund').notNull().default(false),
    importBatchId: uuid('import_batch_id'),
  },
  (table) => [
    index('wua_organisation_id_idx').on(table.organisationId),
    index('wua_parent_id_idx').on(table.parentId),
    index('wua_ward_id_idx').on(table.wardId),
    uniqueIndex('wua_org_reg_no_active_unique')
      .on(table.organisationId, table.regNo)
      .where(sql`"deleted_at" IS NULL`),
  ],
);

export const wuaOfficer = coreSchema.table(
  'wua_officer',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    wuaId: uuid('wua_id')
      .notNull()
      .references(() => wua.id),
    office: wuaOfficeEnum('office').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    fromOn: date('from_on', { mode: 'string' }),
    toOn: date('to_on', { mode: 'string' }),
  },
  (table) => [
    index('wua_officer_wua_id_idx').on(table.wuaId),
    check(
      'wua_officer_dates_check',
      sql`"from_on" IS NULL OR "to_on" IS NULL OR "from_on" <= "to_on"`,
    ),
  ],
);

// --- Access: Roles & Permissions ---
export const role = coreSchema.table('role', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
});

export const rolePermission = coreSchema.table(
  'role_permission',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id),
    permission: text('permission').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] })],
);

// --- Access: Assignments ---
export const assignment = coreSchema.table(
  'assignment',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id),
    module: moduleKeyEnum('module').notNull(),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeStateId: uuid('scope_state_id').references(() => state.id),
    scopeOrgId: uuid('scope_org_id').references(() => organisation.id),
    canCaptureOffline: boolean('can_capture_offline').notNull().default(false),
    validFromOn: date('valid_from_on', { mode: 'string' }),
    validToOn: date('valid_to_on', { mode: 'string' }),
  },
  (table) => [
    index('assignment_user_id_idx').on(table.userId),
    index('assignment_role_id_idx').on(table.roleId),
    index('assignment_scope_state_id_idx').on(table.scopeStateId),
    index('assignment_scope_org_id_idx').on(table.scopeOrgId),
    check(
      'assignment_scope_check',
      sql`((scope_type = 'national' and scope_state_id is null and scope_org_id is null) or (scope_type = 'state' and scope_state_id is not null and scope_org_id is null) or (scope_type in ('rbda','scheme','sector') and scope_org_id is not null and scope_state_id is null))`,
    ),
    check(
      'assignment_dates_check',
      sql`"valid_from_on" IS NULL OR "valid_to_on" IS NULL OR "valid_from_on" <= "valid_to_on"`,
    ),
  ],
);

// --- Admin-editable Lookups ---
export const lookupType = coreSchema.table('lookup_type', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  module: moduleKeyEnum('module').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
});

export const lookupValue = coreSchema.table(
  'lookup_value',
  {
    id: uuid('id').primaryKey(),
    lookupTypeId: uuid('lookup_type_id')
      .notNull()
      .references(() => lookupType.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [uniqueIndex('lookup_value_type_code_unique').on(table.lookupTypeId, table.code)],
);

// --- Files ---
export const file = coreSchema.table(
  'file',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    storageKey: text('storage_key').notNull().unique(),
    originalName: text('original_name'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    scanStatus: fileScanStatusEnum('scan_status').notNull().default('pending'),
    ownerEntity: text('owner_entity'),
    ownerId: uuid('owner_id'),
  },
  () => [check('file_size_bytes_check', sql`"size_bytes" > 0`)],
);

// --- System Settings ---
export const setting = coreSchema.table('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references((): AnyPgColumn => appUser.id),
});
