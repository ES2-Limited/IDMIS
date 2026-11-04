import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';
import {
  appUser,
  basin,
  parameter,
  measurement,
  SYSTEM_USER_ID,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from './index';
import { applyDatabaseGrants } from './release';
import { seed } from './seed';

describe('BLIS Database Schema, Partitions, Lookups and Grants (BE-4.1)', () => {
  const TEST_DB_NAME = `idmis_blis_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let appClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  const TEST_USER_ID = '018f3a5e-3333-7000-8000-000000000001';
  const TEST_BASIN_ID = '018f3a5e-3333-7000-8000-000000000010';
  const TEST_STATION_ID = '018f3a5e-3333-7000-8000-000000000020';
  const TEST_PARAM_ID = '018f3a5e-3333-7000-8000-000000000030';
  const TEST_TYPE_ID = '018f3a5e-3333-7000-8000-000000000040';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    const migrationsFolder = path.resolve(__dirname, '../migrations');
    await migrate(testDb, { migrationsFolder });

    // Seed system user and test user
    await testDb
      .insert(appUser)
      .values({
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        username: 'system',
        fullName: 'System User',
        passwordHash: 'argon2id$test',
        mustChangePassword: false,
      })
      .onConflictDoNothing();

    await testDb
      .insert(appUser)
      .values({
        id: TEST_USER_ID,
        email: 'blis_officer@idmis.gov.ng',
        username: 'blis_officer',
        fullName: 'BLIS Officer',
        passwordHash: 'argon2id$test',
        mustChangePassword: false,
      })
      .onConflictDoNothing();

    // Apply database grants for idmis_app
    await applyDatabaseGrants(testClient);

    appClient = postgres(testDbUrl, {
      user: 'idmis_app',
      password: process.env.APP_DB_PASSWORD || undefined,
    });
  }, 30000);

  afterAll(async () => {
    if (appClient) await appClient.end();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  it('verifies GiST spatial indexes on all geometry columns', async () => {
    const indexes = await testClient<{ tablename: string; indexname: string; indexdef: string }[]>`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'blis' AND indexdef ILIKE '%USING gist%';
    `;

    const indexMap = new Map(indexes.map((idx) => [idx.tablename, idx.indexdef]));
    expect(indexMap.has('basin')).toBe(true);
    expect(indexMap.has('station')).toBe(true);
    expect(indexMap.has('reservoir')).toBe(true);
    expect(indexMap.has('dam')).toBe(true);
    expect(indexMap.has('map_feature')).toBe(true);
  });

  it('inserts readings in 2026 and 2027 and confirms they land in the right child partition', async () => {
    // 1. Create a lookup value for station_type
    const [ltRow] = await testClient<{ id: string }[]>`
      INSERT INTO core.lookup_type (id, key, name, module, is_system)
      VALUES (gen_random_uuid(), 'test_station_type', 'Test Station Type', 'blis', false)
      RETURNING id;
    `;
    await testClient`
      INSERT INTO core.lookup_value (id, lookup_type_id, code, label, sort_order)
      VALUES (${TEST_TYPE_ID}, ${ltRow.id}, 'discharge', 'Discharge', 1);
    `;

    // 2. Create basin, station, parameter
    await testDb.insert(basin).values({
      id: TEST_BASIN_ID,
      code: 'BASIN-001',
      name: 'Hadejia-Jamaare Basin',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testClient`
      INSERT INTO blis.station (
        id, code, name, basin_id, station_type_id, geom,
        version, created_at, created_by, updated_at, updated_by
      )
      VALUES (
        ${TEST_STATION_ID}, 'ST-001', 'Wudil Gauge', ${TEST_BASIN_ID}, ${TEST_TYPE_ID},
        ST_SetSRID(ST_MakePoint(8.85, 11.80), 4326),
        1, now(), ${SYSTEM_USER_ID}, now(), ${SYSTEM_USER_ID}
      );
    `;

    await testDb.insert(parameter).values({
      id: TEST_PARAM_ID,
      code: 'WL',
      name: 'Water Level',
      defaultUnit: 'm',
    });

    // 3. Insert 2026 measurement
    const m2026Id = '018f3a5e-3333-7000-8000-000000000101';
    await testDb.insert(measurement).values({
      id: m2026Id,
      stationId: TEST_STATION_ID,
      parameterId: TEST_PARAM_ID,
      observedAt: '2026-06-15 12:00:00+00',
      value: '14.2500',
      unit: 'm',
      quality: 'raw',
      source: 'manual',
      createdBy: SYSTEM_USER_ID,
    });

    const [row2026] = await testClient<{ partition_name: string }[]>`
      SELECT tableoid::regclass::text AS partition_name
      FROM blis.measurement
      WHERE id = ${m2026Id};
    `;
    expect(row2026.partition_name).toMatch(/measurement_2026/);

    // 4. Insert 2027 measurement
    const m2027Id = '018f3a5e-3333-7000-8000-000000000102';
    await testDb.insert(measurement).values({
      id: m2027Id,
      stationId: TEST_STATION_ID,
      parameterId: TEST_PARAM_ID,
      observedAt: '2027-02-10 08:30:00+00',
      value: '15.1000',
      unit: 'm',
      quality: 'checked',
      source: 'logger',
      createdBy: SYSTEM_USER_ID,
    });

    const [row2027] = await testClient<{ partition_name: string }[]>`
      SELECT tableoid::regclass::text AS partition_name
      FROM blis.measurement
      WHERE id = ${m2027Id};
    `;
    expect(row2027.partition_name).toMatch(/measurement_2027/);
  });

  it('rejects inserting measurement in unpartitioned year (2028)', async () => {
    const m2028Id = '018f3a5e-3333-7000-8000-000000000103';
    let threw = false;
    try {
      await testDb.insert(measurement).values({
        id: m2028Id,
        stationId: TEST_STATION_ID,
        parameterId: TEST_PARAM_ID,
        observedAt: '2028-04-01 10:00:00+00',
        value: '16.0000',
        unit: 'm',
        quality: 'raw',
        source: 'manual',
        createdBy: SYSTEM_USER_ID,
      });
    } catch (err: unknown) {
      threw = true;
      const error = err as { message?: string; cause?: { message?: string } };
      const fullMsg = `${error?.message} ${error?.cause?.message || ''}`;
      expect(fullMsg).toMatch(/no partition of relation "measurement" found for row/i);
    }
    expect(threw).toBe(true);
  });

  it('calling ensure_measurement_partition(2028) as idmis_app succeeds and allows 2028 insertion', async () => {
    // 1. Call ensure_measurement_partition(2028) as idmis_app
    await appClient`
      SELECT blis.ensure_measurement_partition(2028);
    `;

    // 2. Verify partition measurement_2028 exists
    const [partExists] = await testClient<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'blis' AND c.relname = 'measurement_2028';
    `;
    expect(partExists?.relname).toBe('measurement_2028');

    // 3. Inserting in 2028 now succeeds as idmis_app
    const m2028Id = '018f3a5e-3333-7000-8000-000000000104';
    await appClient`
      INSERT INTO blis.measurement (
        id, station_id, parameter_id, observed_at, value, unit, quality, source, created_by
      )
      VALUES (
        ${m2028Id}, ${TEST_STATION_ID}, ${TEST_PARAM_ID},
        '2028-04-01 10:00:00+00', 16.5000, 'm', 'raw', 'manual', ${SYSTEM_USER_ID}
      );
    `;

    const [row2028] = await testClient<{ partition_name: string }[]>`
      SELECT tableoid::regclass::text AS partition_name
      FROM blis.measurement
      WHERE id = ${m2028Id};
    `;
    expect(row2028.partition_name).toMatch(/measurement_2028/);
  });

  it('rejects duplicate (station, parameter, observed_at)', async () => {
    const dupId = '018f3a5e-3333-7000-8000-000000000105';
    let threw = false;
    try {
      await testDb.insert(measurement).values({
        id: dupId,
        stationId: TEST_STATION_ID,
        parameterId: TEST_PARAM_ID,
        observedAt: '2026-06-15 12:00:00+00', // same as m2026Id
        value: '99.9999',
        unit: 'm',
        quality: 'raw',
        source: 'manual',
        createdBy: SYSTEM_USER_ID,
      });
    } catch (err: unknown) {
      threw = true;
      const error = err as { message?: string; cause?: { message?: string } };
      const fullMsg = `${error?.message} ${error?.cause?.message || ''}`;
      expect(fullMsg).toMatch(/measurement_station_param_observed_unique|unique constraint/i);
    }
    expect(threw).toBe(true);
  });

  it('seeds blis_admin role and all 11 BLIS lookup types with expected values', async () => {
    // Run seed on test database
    // Set database URL for seed
    const { setDatabaseUrl } = await import('./index');
    setDatabaseUrl(testDbUrl);
    await seed();

    // 1. Verify blis_admin role in system roles
    const blisRole = SYSTEM_ROLES.find((r) => r.key === 'blis_admin');
    expect(blisRole).toBeDefined();
    expect(blisRole?.isSystem).toBe(true);

    const [dbRole] = await testClient<{ key: string; name: string }[]>`
      SELECT key, name FROM core.role WHERE key = 'blis_admin';
    `;
    expect(dbRole).toBeDefined();
    expect(dbRole.name).toBe('BLIS Administrator');

    // 2. Verify blis_admin permissions
    const blisPerms = SYSTEM_ROLE_PERMISSIONS['blis_admin'];
    expect(blisPerms).toContain('blis.basin.manage');
    expect(blisPerms).toContain('blis.station.manage');
    expect(blisPerms).toContain('blis.measurement.import');
    expect(blisPerms).toContain('blis.dam.manage');
    expect(blisPerms).toContain('blis.inspection.approve');

    // 3. Verify all 11 BLIS lookup types
    const expectedTypes = [
      'station_type',
      'dam_purpose',
      'dam_category',
      'hazard_class',
      'component_rating',
      'bio_resource',
      'occurrence',
      'water_use',
      'priority',
      'stakeholder_category',
      'map_layer_type',
    ];

    for (const key of expectedTypes) {
      const [typeRow] = await testClient<{ id: string; key: string }[]>`
        SELECT id, key FROM core.lookup_type WHERE key = ${key};
      `;
      expect(typeRow, `Lookup type ${key} must exist in core.lookup_type`).toBeDefined();

      const valCount = await testClient<{ count: string }[]>`
        SELECT count(*)::text AS count FROM core.lookup_value WHERE lookup_type_id = ${typeRow.id};
      `;
      expect(Number(valCount[0].count)).toBeGreaterThan(0);
    }
  });
});
