import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, sql } from 'drizzle-orm';
import { ESLint } from 'eslint';
import * as schema from './schema';
import {
  appUser,
  resultsFramework,
  indicator,
  indicatorTarget,
  indicatorValue,
  loadMeIndicators,
  validateIndicatorDefinitions,
  type IndicatorSeedDefinition,
} from './index';
import { SYSTEM_USER_ID } from './constants';
import { applyDatabaseGrants } from './release';

describe('M&E Database Schema, Slot Rules, Grants, and Loader (BE-3.1)', () => {
  const TEST_DB_NAME = `idmis_me_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  const TEST_USER_ID = '018f3a5e-2222-7000-8000-000000000001';
  const TEST_FRAMEWORK_ID = '018f3a5e-2222-7000-8000-000000000010';
  const TEST_INDICATOR_ID = '018f3a5e-2222-7000-8000-000000000020';

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
        email: 'me.officer@idmis.gov.ng',
        username: 'me.officer',
        fullName: 'M&E Officer',
        passwordHash: 'argon2id$test',
        mustChangePassword: false,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();

    // Create a base Results Framework for test suite
    await testDb.insert(resultsFramework).values({
      id: TEST_FRAMEWORK_ID,
      name: 'TRIMING Results Framework Test',
      version: 'test-1.0',
      isCurrent: false,
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });

    // Create a base indicator
    await testDb.insert(indicator).values({
      id: TEST_INDICATOR_ID,
      frameworkId: TEST_FRAMEWORK_ID,
      code: '1a',
      name: 'Irrigated Area Under Improved Management',
      level: 'pdo',
      unit: 'ha',
      frequency: 'annual',
      method: 'manual',
      computeKey: null,
      disaggregations: ['scheme'],
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });
  });

  afterAll(async () => {
    if (testClient) {
      await testClient.end({ timeout: 5 });
    }
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end({ timeout: 5 });
    }
  });

  it('migration applies cleanly and creates me schema tables and types', async () => {
    const types = await testClient`
      SELECT typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'me'
      ORDER BY typname;
    `;
    const typeNames = types.map((r) => r.typname);
    expect(typeNames).toContain('indicator_level');
    expect(typeNames).toContain('indicator_method');
    expect(typeNames).toContain('value_source');

    const tables = await testClient`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'me'
      ORDER BY table_name;
    `;
    const tableNames = tables.map((r) => r.table_name);
    expect(tableNames).toContain('results_framework');
    expect(tableNames).toContain('indicator');
    expect(tableNames).toContain('indicator_target');
    expect(tableNames).toContain('indicator_value');
    expect(tableNames).toContain('indicator_value_evidence');
    expect(tableNames).toContain('survey');
    expect(tableNames).toContain('survey_question');
    expect(tableNames).toContain('survey_response');
    expect(tableNames).toContain('survey_answer');
    expect(tableNames).toContain('scorecard');
    expect(tableNames).toContain('matching_grant');
    expect(tableNames).toContain('tech_adoption');
  });

  it('slot rule: duplicate rejected including NULL quarter and reordered disaggregation keys', async () => {
    // 1. Insert national annual value (quarter = NULL) with disaggregation { b: "1", a: "2" }
    const firstId = crypto.randomUUID();
    await testDb.insert(indicatorValue).values({
      id: firstId,
      indicatorId: TEST_INDICATOR_ID,
      periodYear: 2026,
      periodQuarter: null,
      scopeType: 'national',
      scopeStateId: null,
      scopeOrgId: null,
      disaggregation: { b: '1', a: '2' },
      value: '1500.5000',
      source: 'manual',
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });

    // Verify trigger normalised disaggregation to {"a": "2", "b": "1"}
    const [inserted] = await testDb
      .select()
      .from(indicatorValue)
      .where(eq(indicatorValue.id, firstId));
    expect(inserted.disaggregation).toEqual({ a: '2', b: '1' });

    // 2. Attempt duplicate insert with reversed disaggregation keys and NULL quarter
    const secondId = crypto.randomUUID();
    let duplicateRejected = false;
    try {
      await testDb.insert(indicatorValue).values({
        id: secondId,
        indicatorId: TEST_INDICATOR_ID,
        periodYear: 2026,
        periodQuarter: null,
        scopeType: 'national',
        scopeStateId: null,
        scopeOrgId: null,
        disaggregation: { a: '2', b: '1' },
        value: '1600.0000',
        source: 'manual',
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });
    } catch (err: unknown) {
      duplicateRejected = true;
      const error = err as { cause?: { constraint?: string; message?: string }; message?: string };
      const constraint = error.cause?.constraint || error.cause?.message || error.message;
      expect(constraint).toContain('indicator_value_slot_unique');
    }
    expect(duplicateRejected).toBe(true);

    // 3. Attempt duplicate insert with extra empty string and null values in disaggregation
    const thirdId = crypto.randomUUID();
    let duplicateEmptyKeyRejected = false;
    try {
      await testDb.insert(indicatorValue).values({
        id: thirdId,
        indicatorId: TEST_INDICATOR_ID,
        periodYear: 2026,
        periodQuarter: null,
        scopeType: 'national',
        scopeStateId: null,
        scopeOrgId: null,
        disaggregation: { a: '2', b: '1', emptyKey: '', nullKey: null },
        value: '1700.0000',
        source: 'manual',
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });
    } catch (err: unknown) {
      duplicateEmptyKeyRejected = true;
      const error = err as { cause?: { constraint?: string; message?: string }; message?: string };
      const constraint = error.cause?.constraint || error.cause?.message || error.message;
      expect(constraint).toContain('indicator_value_slot_unique');
    }
    expect(duplicateEmptyKeyRejected).toBe(true);

    // 4. Indicator target slot rule: duplicate rejected with NULL scope
    await testDb.insert(indicatorTarget).values({
      id: crypto.randomUUID(),
      indicatorId: TEST_INDICATOR_ID,
      year: 2026,
      scopeType: 'national',
      scopeStateId: null,
      scopeOrgId: null,
      value: '2000.0000',
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });

    let targetDuplicateRejected = false;
    try {
      await testDb.insert(indicatorTarget).values({
        id: crypto.randomUUID(),
        indicatorId: TEST_INDICATOR_ID,
        year: 2026,
        scopeType: 'national',
        scopeStateId: null,
        scopeOrgId: null,
        value: '2500.0000',
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });
    } catch (err: unknown) {
      targetDuplicateRejected = true;
      const error = err as { cause?: { constraint?: string; message?: string }; message?: string };
      const constraint = error.cause?.constraint || error.cause?.message || error.message;
      expect(constraint).toContain('indicator_target_slot_unique');
    }
    expect(targetDuplicateRejected).toBe(true);
  });

  it('compute_key check: computed indicator without key is rejected; manual without key succeeds', async () => {
    // 1. Computed indicator without key should fail DB check constraint
    let computedCheckFailed = false;
    try {
      await testDb.insert(indicator).values({
        id: crypto.randomUUID(),
        frameworkId: TEST_FRAMEWORK_ID,
        code: '2a',
        name: 'Computed Yield Without Key',
        level: 'intermediate',
        unit: 't/ha',
        frequency: 'seasonal',
        method: 'computed',
        computeKey: null,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });
    } catch (err: unknown) {
      computedCheckFailed = true;
      const error = err as { cause?: { constraint?: string; message?: string }; message?: string };
      const constraintName = error.cause?.constraint || error.cause?.message || error.message;
      expect(constraintName).toContain('indicator_method_compute_key_check');
    }
    expect(computedCheckFailed).toBe(true);

    // 2. Computed indicator with valid compute key succeeds
    const validComputedId = crypto.randomUUID();
    await testDb.insert(indicator).values({
      id: validComputedId,
      frameworkId: TEST_FRAMEWORK_ID,
      code: '2b',
      name: 'Computed Yield With Key',
      level: 'intermediate',
      unit: 't/ha',
      frequency: 'seasonal',
      method: 'computed',
      computeKey: 'slis.yield',
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });

    const [compRow] = await testDb
      .select()
      .from(indicator)
      .where(eq(indicator.id, validComputedId));
    expect(compRow).toBeDefined();
    expect(compRow.computeKey).toBe('slis.yield');

    // 3. Manual indicator without key succeeds
    const manualId = crypto.randomUUID();
    await testDb.insert(indicator).values({
      id: manualId,
      frameworkId: TEST_FRAMEWORK_ID,
      code: '3a',
      name: 'Manual Indicator',
      level: 'intermediate',
      unit: 'Number',
      frequency: 'annual',
      method: 'manual',
      computeKey: null,
      createdBy: TEST_USER_ID,
      updatedBy: TEST_USER_ID,
    });

    const [manRow] = await testDb.select().from(indicator).where(eq(indicator.id, manualId));
    expect(manRow).toBeDefined();
    expect(manRow.computeKey).toBeNull();
  });

  it('grants as idmis_app: idmis_app role has SELECT, INSERT, UPDATE, DELETE on me schema', async () => {
    // Apply database grants on the test database
    await applyDatabaseGrants(testClient, ['core', 'slis', 'me']);

    // Run queries using SET ROLE idmis_app
    const result = await testClient.unsafe(`
      SET ROLE idmis_app;
      SELECT count(*) FROM "me"."indicator";
      RESET ROLE;
    `);

    expect(result).toBeDefined();
  });

  it('sync guard covers new tables: survey_response, survey_answer, tech_adoption', async () => {
    const triggers = (await testClient`
      SELECT c.relname as table_name, t.tgname as trigger_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'me' AND t.tgname LIKE 'trg_change_log_%' AND t.tgisinternal = false
      ORDER BY c.relname;
    `) as unknown as Array<{ table_name: string; trigger_name: string }>;

    const meTriggerTables = triggers.map((r) => r.table_name);
    expect(meTriggerTables).toContain('survey_response');
    expect(meTriggerTables).toContain('survey_answer');
    expect(meTriggerTables).toContain('tech_adoption');
  });

  it('boundary rule fails on direct slis import in modules/me', async () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const eslint = new ESLint({
      cwd: rootDir,
      overrideConfigFile: path.resolve(rootDir, 'packages/config/eslint.config.mjs'),
    });

    // 1. Direct module import outside public/ fails boundary check
    const invalidCode = `
      import { FarmerService } from '../slis/services/farmer.service.ts';
      console.log(FarmerService);
    `;

    const invalidResults = await eslint.lintText(invalidCode, {
      filePath: path.resolve(rootDir, 'apps/api/src/modules/me/dummy.ts'),
    });

    expect(invalidResults.length).toBeGreaterThan(0);
    const boundaryError = invalidResults[0]!.messages.find(
      (m) => m.ruleId === 'boundaries/entry-point',
    );
    expect(boundaryError).toBeDefined();

    // 2. Module import through public/ succeeds boundary check
    const validCode = `
      import { FarmerService } from '../slis/public/index.ts';
      console.log(FarmerService);
    `;

    const validResults = await eslint.lintText(validCode, {
      filePath: path.resolve(rootDir, 'apps/api/src/modules/me/dummy.ts'),
    });

    const validBoundaryErrors = validResults[0]!.messages.filter(
      (m) => m.ruleId === 'boundaries/entry-point',
    );
    expect(validBoundaryErrors).toHaveLength(0);
  });

  describe('Indicator Seed Loader', () => {
    it('validateIndicatorDefinitions rejects empty codes, duplicates, missing units, and invalid compute keys', () => {
      // 1. Empty code
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '',
            name: 'Test',
            level: 'pdo',
            unit: 'Number',
            method: 'manual',
          },
        ]),
      ).toThrow(/cannot be empty/i);

      // 2. Duplicate codes
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '1a',
            name: 'First',
            level: 'pdo',
            unit: 'Number',
            method: 'manual',
          },
          {
            code: '1a',
            name: 'Second',
            level: 'pdo',
            unit: 'Number',
            method: 'manual',
          },
        ]),
      ).toThrow(/duplicate indicator code/i);

      // 3. Missing unit
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '2a',
            name: 'No Unit',
            level: 'pdo',
            unit: '',
            method: 'manual',
          },
        ]),
      ).toThrow(/must have a non-empty unit/i);

      // 4. Method 'computed' without computeKey
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '3a',
            name: 'Computed Missing Key',
            level: 'intermediate',
            unit: '%',
            method: 'computed',
            computeKey: null,
          },
        ]),
      ).toThrow(/must have a computeKey/i);

      // 5. Method 'computed' with unknown computeKey
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '4a',
            name: 'Computed Bad Key',
            level: 'intermediate',
            unit: '%',
            method: 'computed',
            computeKey: 'unknown.invalid_key',
          },
        ]),
      ).toThrow(/unknown computeKey/i);

      // 6. Method 'survey' with unknown computeKey
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '4b',
            name: 'Survey Bad Key',
            level: 'intermediate',
            unit: '%',
            method: 'survey',
            computeKey: 'unknown.survey_key',
          },
        ]),
      ).toThrow(/unknown computeKey/i);

      // 7. Method 'manual' with computeKey is rejected
      expect(() =>
        validateIndicatorDefinitions([
          {
            code: '4c',
            name: 'Manual With Key',
            level: 'intermediate',
            unit: 'Number',
            method: 'manual',
            computeKey: 'slis.beneficiaries',
          },
        ]),
      ).toThrow(/manual.*must not have a computeKey/i);
    });

    it('loadMeIndicators loads all 22 indicators from provisional framework, is idempotent, and preserves data', async () => {
      // 1. Initial seed load
      const res1 = await loadMeIndicators(undefined, undefined, testDb);
      expect(res1.loaded).toBe(22);

      const [fw] = await testDb
        .select()
        .from(resultsFramework)
        .where(eq(resultsFramework.isCurrent, true));
      expect(fw).toBeDefined();
      expect(fw.name).toBe('TRIMING Results Framework');
      expect(fw.version).toBe('2.0-provisional');

      const allRows = await testDb.select().from(indicator).where(eq(indicator.frameworkId, fw.id));
      expect(allRows.length).toBe(22);

      // Check specific indicators
      const ind1a = allRows.find((r) => r.code === '1a');
      expect(ind1a).toBeDefined();
      expect(ind1a?.name).toBe('Direct project beneficiaries');
      expect(ind1a?.computeKey).toBe('slis.beneficiaries');
      expect(ind1a?.endTarget).toBe('10000000.0000');
      expect(ind1a?.endTargetNote).toBe('legacy figure, to be confirmed');
      expect(ind1a?.frequency).toBe('quarterly');

      const ind11 = allRows.find((r) => r.code === '11');
      expect(ind11).toBeDefined();
      expect(ind11?.method).toBe('survey');
      expect(ind11?.computeKey).toBe('me.survey.wua_participation');
      expect(ind11?.endTarget).toBe('90.0000');

      const ind5 = allRows.find((r) => r.code === '5');
      expect(ind5).toBeDefined();
      expect(ind5?.method).toBe('computed');
      expect(ind5?.computeKey).toBe('blis.dams_safe');
      expect(ind5?.endTarget).toBe('8.0000');

      // 2. Re-running changes nothing and produces no duplicates
      const res2 = await loadMeIndicators(undefined, undefined, testDb);
      expect(res2.loaded).toBe(22);

      const allRowsAfter = await testDb
        .select()
        .from(indicator)
        .where(eq(indicator.frameworkId, fw.id));
      expect(allRowsAfter.length).toBe(22);
    });

    it('loadMeIndicators upserts custom definitions by (framework_id, code)', async () => {
      const validDefinitions: IndicatorSeedDefinition[] = [
        {
          code: '10a',
          name: 'WUAs with Maintenance Funds',
          level: 'intermediate',
          unit: '%',
          frequency: 'quarterly',
          method: 'computed',
          computeKey: 'core.wua_operational',
          disaggregations: ['scheme'],
          baseline: '12.5000',
          baselineYear: 2020,
        },
        {
          code: '11a',
          name: 'Farmer Household Satisfaction Rate',
          level: 'pdo',
          unit: '%',
          frequency: 'quarterly',
          method: 'survey',
          computeKey: 'me.survey.wua_participation',
          disaggregations: ['gender', 'scheme'],
        },
      ];

      const res = await loadMeIndicators(TEST_FRAMEWORK_ID, validDefinitions, testDb);
      expect(res.loaded).toBe(2);

      const rows = await testDb
        .select()
        .from(indicator)
        .where(eq(indicator.frameworkId, TEST_FRAMEWORK_ID));

      const codes = rows.map((r) => r.code);
      expect(codes).toContain('10a');
      expect(codes).toContain('11a');

      // Update definition and reload -> upserts instead of error
      validDefinitions[0]!.name = 'Updated WUA Maintenance Name';
      const reloadRes = await loadMeIndicators(TEST_FRAMEWORK_ID, validDefinitions, testDb);
      expect(reloadRes.loaded).toBe(2);

      const [updatedRow] = await testDb
        .select()
        .from(indicator)
        .where(sql`${indicator.frameworkId} = ${TEST_FRAMEWORK_ID} AND ${indicator.code} = '10a'`);
      expect(updatedRow.name).toBe('Updated WUA Maintenance Name');
    });
  });
});
