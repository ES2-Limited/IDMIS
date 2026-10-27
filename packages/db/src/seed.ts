import { sql } from 'drizzle-orm';
import { client, db } from './index';
import {
  appUser,
  state,
  role,
  rolePermission,
  assignment,
  lookupType,
  lookupValue,
  setting,
} from './schema';
import { permissions } from '@idmis/contracts';
import { SYSTEM_USER_ID } from './constants';

const ADMIN_ID = '018f3a5e-0000-7000-8000-000000000001';
const ROLE_SYSTEM_ADMIN_ID = '018f3a5e-0000-7000-8000-000000000010';
const ASSIGNMENT_ADMIN_ID = '018f3a5e-0000-7000-8000-000000000020';

export const NIGERIA_STATES = [
  { code: 'AB', name: 'Abia' },
  { code: 'AD', name: 'Adamawa' },
  { code: 'AK', name: 'Akwa Ibom' },
  { code: 'AN', name: 'Anambra' },
  { code: 'BA', name: 'Bauchi' },
  { code: 'BY', name: 'Bayelsa' },
  { code: 'BE', name: 'Benue' },
  { code: 'BO', name: 'Borno' },
  { code: 'CR', name: 'Cross River' },
  { code: 'DE', name: 'Delta' },
  { code: 'EB', name: 'Ebonyi' },
  { code: 'ED', name: 'Edo' },
  { code: 'EK', name: 'Ekiti' },
  { code: 'EN', name: 'Enugu' },
  { code: 'FC', name: 'Federal Capital Territory' },
  { code: 'GO', name: 'Gombe' },
  { code: 'IM', name: 'Imo' },
  { code: 'JI', name: 'Jigawa' },
  { code: 'KD', name: 'Kaduna' },
  { code: 'KN', name: 'Kano' },
  { code: 'KT', name: 'Katsina' },
  { code: 'KE', name: 'Kebbi' },
  { code: 'KO', name: 'Kogi' },
  { code: 'KW', name: 'Kwara' },
  { code: 'LA', name: 'Lagos' },
  { code: 'NA', name: 'Nasarawa' },
  { code: 'NI', name: 'Niger' },
  { code: 'OG', name: 'Ogun' },
  { code: 'ON', name: 'Ondo' },
  { code: 'OS', name: 'Osun' },
  { code: 'OY', name: 'Oyo' },
  { code: 'PL', name: 'Plateau' },
  { code: 'RI', name: 'Rivers' },
  { code: 'SO', name: 'Sokoto' },
  { code: 'TA', name: 'Taraba' },
  { code: 'YO', name: 'Yobe' },
  { code: 'ZA', name: 'Zamfara' },
] as const;

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

export const BASE_LOOKUPS = [
  {
    key: 'document_type',
    name: 'Identification Document Type',
    module: 'slis' as const,
    values: [
      { code: 'nin', label: 'National Identity Number (NIN)', sortOrder: 1 },
      { code: 'bvn', label: 'Bank Verification Number (BVN)', sortOrder: 2 },
      { code: 'voters_card', label: "Voter's Card", sortOrder: 3 },
      { code: 'national_id', label: 'National ID Card', sortOrder: 4 },
      { code: 'passport', label: 'International Passport', sortOrder: 5 },
      { code: 'drivers_license', label: "Driver's License", sortOrder: 6 },
    ],
  },
  {
    key: 'marital_status',
    name: 'Marital Status',
    module: 'slis' as const,
    values: [
      { code: 'single', label: 'Single', sortOrder: 1 },
      { code: 'married', label: 'Married', sortOrder: 2 },
      { code: 'divorced', label: 'Divorced', sortOrder: 3 },
      { code: 'widowed', label: 'Widowed', sortOrder: 4 },
    ],
  },
  {
    key: 'crop_type',
    name: 'Crop Type',
    module: 'slis' as const,
    values: [
      { code: 'rice', label: 'Rice', sortOrder: 1 },
      { code: 'maize', label: 'Maize', sortOrder: 2 },
      { code: 'tomato', label: 'Tomato', sortOrder: 3 },
      { code: 'wheat', label: 'Wheat', sortOrder: 4 },
      { code: 'sorghum', label: 'Sorghum', sortOrder: 5 },
      { code: 'onion', label: 'Onion', sortOrder: 6 },
      { code: 'cassava', label: 'Cassava', sortOrder: 7 },
    ],
  },
  {
    key: 'irrigation_type',
    name: 'Irrigation Type',
    module: 'slis' as const,
    values: [
      { code: 'gravity', label: 'Gravity', sortOrder: 1 },
      { code: 'pump', label: 'Pump', sortOrder: 2 },
      { code: 'drip', label: 'Drip', sortOrder: 3 },
      { code: 'sprinkler', label: 'Sprinkler', sortOrder: 4 },
    ],
  },
  {
    key: 'tenure_type',
    name: 'Land Tenure Type',
    module: 'slis' as const,
    values: [
      { code: 'owner', label: 'Owner / Freehold', sortOrder: 1 },
      { code: 'tenant', label: 'Tenant / Rented', sortOrder: 2 },
      { code: 'leaseholder', label: 'Leaseholder', sortOrder: 3 },
      { code: 'communal', label: 'Communal / Family Land', sortOrder: 4 },
    ],
  },
  {
    key: 'station_type',
    name: 'Hydrometric Station Type',
    module: 'blis' as const,
    values: [
      { code: 'hydrological', label: 'Hydrological', sortOrder: 1 },
      { code: 'meteorological', label: 'Meteorological', sortOrder: 2 },
      { code: 'agro_meteorological', label: 'Agro-meteorological', sortOrder: 3 },
    ],
  },
  {
    key: 'dam_purpose',
    name: 'Dam Primary Purpose',
    module: 'blis' as const,
    values: [
      { code: 'irrigation', label: 'Irrigation', sortOrder: 1 },
      { code: 'flood_control', label: 'Flood Control', sortOrder: 2 },
      { code: 'water_supply', label: 'Water Supply', sortOrder: 3 },
      { code: 'hydropower', label: 'Hydropower', sortOrder: 4 },
    ],
  },
  {
    key: 'dam_category',
    name: 'Dam Category',
    module: 'blis' as const,
    values: [
      { code: 'large', label: 'Large Dam', sortOrder: 1 },
      { code: 'medium', label: 'Medium Dam', sortOrder: 2 },
      { code: 'small', label: 'Small Dam', sortOrder: 3 },
    ],
  },
  {
    key: 'dam_rating',
    name: 'Dam Safety Condition Rating',
    module: 'blis' as const,
    values: [
      { code: 'good', label: 'Good', sortOrder: 1 },
      { code: 'fair', label: 'Fair', sortOrder: 2 },
      { code: 'poor', label: 'Poor', sortOrder: 3 },
      { code: 'critical', label: 'Critical', sortOrder: 4 },
    ],
  },
  {
    key: 'hazard_class',
    name: 'Dam Hazard Classification',
    module: 'blis' as const,
    values: [
      { code: 'high', label: 'High Hazard', sortOrder: 1 },
      { code: 'significant', label: 'Significant Hazard', sortOrder: 2 },
      { code: 'low', label: 'Low Hazard', sortOrder: 3 },
    ],
  },
  {
    key: 'layer_type',
    name: 'GIS Map Layer Type',
    module: 'blis' as const,
    values: [
      { code: 'base_map', label: 'Base Map', sortOrder: 1 },
      { code: 'river_basin', label: 'River Basin Boundary', sortOrder: 2 },
      { code: 'scheme_boundary', label: 'Irrigation Scheme Boundary', sortOrder: 3 },
      { code: 'sector_boundary', label: 'Sector Boundary', sortOrder: 4 },
    ],
  },
] as const;

export async function seed() {
  console.log('--- Starting IDMIS 2.0 Core Seed ---');

  // 1. Seed System User first (is_active = false, unusable password hash '*')
  console.log(`Seeding System User: ${SYSTEM_USER_ID}`);
  await db
    .insert(appUser)
    .values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.internal',
      username: 'system',
      fullName: 'System',
      passwordHash: '*',
      isActive: false,
      mustChangePassword: false,
      failedSignIns: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    })
    .onConflictDoNothing({ target: appUser.id });

  // 2. First System Administrator from env vars only (no fallback in code)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !adminPasswordHash) {
    console.log('Skipping System Administrator seed: ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set');
  } else {
    const adminUsername = process.env.ADMIN_USERNAME || 'sysadmin';
    const adminFullName = process.env.ADMIN_FULL_NAME || 'System Administrator';

    if (!adminPasswordHash.startsWith('$argon2id$')) {
      throw new Error(
        'Invalid ADMIN_PASSWORD_HASH: Must be a valid Argon2id hash starting with "$argon2id$". Plaintext passwords are not permitted.',
      );
    }

    console.log(`Seeding System Administrator: ${adminEmail} (${adminUsername})`);
    await db
      .insert(appUser)
      .values({
        id: ADMIN_ID,
        email: adminEmail,
        username: adminUsername,
        fullName: adminFullName,
        passwordHash: adminPasswordHash,
        isActive: true,
        mustChangePassword: true,
        failedSignIns: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoUpdate({
        target: appUser.id,
        set: {
          email: adminEmail,
          passwordHash: adminPasswordHash,
          updatedAt: sql`NOW()`,
        },
      });
  }

  // 3. Nigeria 36 States + FCT (37 rows)
  console.log(`Seeding ${NIGERIA_STATES.length} States + FCT...`);
  for (let i = 0; i < NIGERIA_STATES.length; i++) {
    const s = NIGERIA_STATES[i]!;
    const stateId = `018f3a5e-0001-7000-8000-${String(i + 1).padStart(12, '0')}`;
    await db
      .insert(state)
      .values({
        id: stateId,
        code: s.code,
        name: s.name,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing({ target: state.code });
  }

  // 4. System Roles & Permissions
  console.log(`Seeding ${SYSTEM_ROLES.length} System Roles...`);
  for (const r of SYSTEM_ROLES) {
    await db
      .insert(role)
      .values({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
      })
      .onConflictDoNothing({ target: role.key });
  }

  // Assign all core permissions to system_admin role
  console.log('Seeding System Administrator permissions...');
  const allPermissions = Object.values(permissions);
  for (const perm of allPermissions) {
    await db
      .insert(rolePermission)
      .values({
        roleId: ROLE_SYSTEM_ADMIN_ID,
        permission: perm,
      })
      .onConflictDoNothing();
  }

  // 5. Initial Assignment: Assign System Admin user to system_admin role with national scope
  if (adminEmail && adminPasswordHash) {
    console.log('Seeding National Scope Assignment for System Administrator...');
    await db
      .insert(assignment)
      .values({
        id: ASSIGNMENT_ADMIN_ID,
        userId: ADMIN_ID,
        roleId: ROLE_SYSTEM_ADMIN_ID,
        module: 'core',
        scopeType: 'national',
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing({ target: assignment.id });
  }

  // 6. Base Lookups
  console.log('Seeding Base Lookups...');
  for (let tIdx = 0; tIdx < BASE_LOOKUPS.length; tIdx++) {
    const lt = BASE_LOOKUPS[tIdx]!;
    const lookupTypeId = `018f3a5e-0002-7000-8000-${String(tIdx + 1).padStart(12, '0')}`;

    await db
      .insert(lookupType)
      .values({
        id: lookupTypeId,
        key: lt.key,
        name: lt.name,
        module: lt.module,
        isSystem: true,
      })
      .onConflictDoNothing({ target: lookupType.key });

    for (let vIdx = 0; vIdx < lt.values.length; vIdx++) {
      const val = lt.values[vIdx]!;
      const lookupValId = `018f3a5e-0003-7000-${String(tIdx + 1).padStart(4, '0')}-${String(vIdx + 1).padStart(12, '0')}`;

      await db
        .insert(lookupValue)
        .values({
          id: lookupValId,
          lookupTypeId,
          code: val.code,
          label: val.label,
          sortOrder: val.sortOrder,
          isActive: true,
        })
        .onConflictDoNothing();
    }
  }

  // 7. Settings: offline_capture_days = 7
  console.log('Seeding System Settings (offline_capture_days = 7)...');
  await db
    .insert(setting)
    .values({
      key: 'offline_capture_days',
      value: { days: 7 },
      updatedBy: SYSTEM_USER_ID,
    })
    .onConflictDoNothing({ target: setting.key });

  console.log('--- Core Seed Completed Successfully ---');
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Allow direct execution
const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('seed.ts') ||
    process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  seed()
    .then(async () => {
      await client.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await client.end();
      process.exit(1);
    });
}
