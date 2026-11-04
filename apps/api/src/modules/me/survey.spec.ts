import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { permissions, ME_IMPORT_TEMPLATES } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  state,
  organisation,
  organisationState,
  surveyResponse,
  surveyAnswer,
  device,
  file,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
  isNull,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M&E Surveys, Typed Answers, Question Freeze, Sync & Imports (BE-3.4)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_me_surveys_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test User IDs
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const KANO_ME_OFFICER_ID = crypto.randomUUID();
  const KANO_STATE_OFFICER_ID = crypto.randomUUID();
  const FIELD_OFFICER_ID = crypto.randomUUID();
  const LAGOS_ME_OFFICER_ID = crypto.randomUUID();
  const SYSTEM_USER_ID = crypto.randomUUID();

  // Role IDs
  const ME_NATIONAL_ROLE_ID = crypto.randomUUID();
  const ME_OFFICER_ROLE_ID = crypto.randomUUID();
  const FIELD_OFFICER_ROLE_ID = crypto.randomUUID();

  // Geography & Scheme IDs
  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();
  const LAGOS_SCHEME_ID = crypto.randomUUID();

  // Device ID for offline sync
  const FIELD_DEVICE_ID = crypto.randomUUID();
  const STATE_DEVICE_ID = crypto.randomUUID();

  // Tokens
  let nationalToken: string;
  let kanoOfficerToken: string;
  let kanoStateOfficerToken: string;
  let fieldOfficerToken: string;
  let lagosOfficerToken: string;

  const mockStorageFiles = new Map<string, Buffer>();

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;

    // Apply migrations
    const { migrate } = await import('@idmis/db');
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    const { initAuditWriter } = await import('../../platform/audit/audit-writer');
    initAuditWriter();

    // 2. Initialize Nest Application
    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: ['error', 'warn'],
    });
    const { ProblemDetailsFilter } = await import('../../platform/filters/problem-details.filter');
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
    storageService = app.get(StorageService);

    // Mock storageService.getObjectBuffer
    storageService.getObjectBuffer = async (storageKey: string) => {
      const buf = mockStorageFiles.get(storageKey);
      if (!buf) throw new Error(`Mock storage file not found: ${storageKey}`);
      return buf;
    };

    // 3. Seed Users, Roles, Geography & Schemes
    const now = new Date().toISOString();

    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System Admin',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: NATIONAL_ADMIN_ID,
        email: 'national.admin@idmis.gov.ng',
        fullName: 'National Admin',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_ME_OFFICER_ID,
        email: 'kano.me@idmis.gov.ng',
        fullName: 'Kano MEOfficer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_STATE_OFFICER_ID,
        email: 'kano.state@idmis.gov.ng',
        fullName: 'Kano State Officer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: FIELD_OFFICER_ID,
        email: 'kano.field@idmis.gov.ng',
        fullName: 'Field Officer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_ME_OFFICER_ID,
        email: 'lagos.me@idmis.gov.ng',
        fullName: 'Lagos MEOfficer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_ID,
        code: 'LA',
        name: 'Lagos',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        code: 'LRIS',
        name: 'Lagos Scheme',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // Roles and permissions
    await testDb.insert(role).values([
      {
        id: ME_NATIONAL_ROLE_ID,
        key: 'me_national_lead',
        name: 'M&E National Lead',
        description: 'National',
      },
      {
        id: ME_OFFICER_ROLE_ID,
        key: 'me_officer',
        name: 'M&E Officer',
        description: 'Officer',
      },
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: 'field_officer',
        name: 'Field Officer',
        description: 'Field Officer',
      },
    ]);

    // Permissions
    const nationalPerms = [
      permissions.ME_SURVEY_MANAGE,
      permissions.ME_SURVEY_RESPOND,
      permissions.CORE_IMPORT_RUN,
    ];
    const officerPerms = [
      permissions.ME_SURVEY_MANAGE,
      permissions.ME_SURVEY_RESPOND,
      permissions.CORE_IMPORT_RUN,
      permissions.SLIS_SYNC_PUSH,
      permissions.SLIS_SYNC_PULL,
    ];
    const fieldPerms = [
      permissions.ME_SURVEY_RESPOND,
      permissions.SLIS_SYNC_PUSH,
      permissions.SLIS_SYNC_PULL,
    ];

    for (const p of nationalPerms) {
      await testDb.insert(rolePermission).values({ roleId: ME_NATIONAL_ROLE_ID, permission: p });
    }
    for (const p of officerPerms) {
      await testDb.insert(rolePermission).values({ roleId: ME_OFFICER_ROLE_ID, permission: p });
    }
    for (const p of fieldPerms) {
      await testDb.insert(rolePermission).values({ roleId: FIELD_OFFICER_ROLE_ID, permission: p });
    }

    // Role Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: NATIONAL_ADMIN_ID,
        roleId: ME_NATIONAL_ROLE_ID,
        module: 'me',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_ME_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_STATE_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_STATE_OFFICER_ID,
        roleId: FIELD_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        roleId: FIELD_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: LAGOS_ME_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: LAGOS_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Field Devices
    await testDb.insert(device).values([
      {
        id: FIELD_DEVICE_ID,
        installationId: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        label: 'Field Officer Pixel',
        platform: 'android',
        registeredAt: now,
        lastSeenAt: now,
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: STATE_DEVICE_ID,
        installationId: crypto.randomUUID(),
        userId: KANO_STATE_OFFICER_ID,
        label: 'State Officer Tablet',
        platform: 'android',
        registeredAt: now,
        lastSeenAt: now,
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    // Generate Sessions & Tokens
    const makeToken = async (userId: string) => {
      const sid = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sid,
        familyId: crypto.randomUUID(),
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      return (await tokenService.createAccessToken(userId, sid)).accessToken;
    };

    nationalToken = await makeToken(NATIONAL_ADMIN_ID);
    kanoOfficerToken = await makeToken(KANO_ME_OFFICER_ID);
    kanoStateOfficerToken = await makeToken(KANO_STATE_OFFICER_ID);
    fieldOfficerToken = await makeToken(FIELD_OFFICER_ID);
    lagosOfficerToken = await makeToken(LAGOS_ME_OFFICER_ID);
  });

  afterAll(async () => {
    resetAuditWriter();
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore drop error
      }
      await adminClient.end();
    }
  });

  describe('Survey CRUD and Question Freeze (BE-3.4)', () => {
    let surveyId: string;
    let textQId: string;

    it('creates a survey with questions of all 6 typed formats', async () => {
      // 1. Create Survey
      const res = await app.inject({
        method: 'POST',
        url: '/me/surveys',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          name: 'Farmer Household Survey 2026',
          schemeId: KANO_SCHEME_ID,
          opensOn: '2026-01-01',
          closesOn: '2026-12-31',
        },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Farmer Household Survey 2026');
      expect(data.version).toBe(1);
      surveyId = data.id;

      // 2. Add Questions for all 6 types
      // text
      const q1 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_NAME',
          text: 'Respondent Full Name',
          answerType: 'text',
          sortOrder: 1,
          isRequired: true,
        },
      });
      expect(q1.statusCode).toBe(201);
      textQId = q1.json().id;

      // number
      const q2 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_INCOME',
          text: 'Annual Household Income (NGN)',
          answerType: 'number',
          sortOrder: 2,
          isRequired: true,
        },
      });
      expect(q2.statusCode).toBe(201);

      // single choice
      const q3 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_GENDER',
          text: 'Respondent Gender',
          answerType: 'single',
          options: ['Male', 'Female', 'Other'],
          sortOrder: 3,
          isRequired: true,
        },
      });
      expect(q3.statusCode).toBe(201);

      // multi choice
      const q4 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_CROPS',
          text: 'Primary Crops Grown',
          answerType: 'multi',
          options: ['Rice', 'Maize', 'Wheat', 'Tomato'],
          sortOrder: 4,
          isRequired: false,
        },
      });
      expect(q4.statusCode).toBe(201);

      // date
      const q5 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_DOB',
          text: 'Date of Birth',
          answerType: 'date',
          sortOrder: 5,
          isRequired: false,
        },
      });
      expect(q5.statusCode).toBe(201);

      // gps
      const q6 = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_LOC',
          text: 'Farm GPS Location',
          answerType: 'gps',
          sortOrder: 6,
          isRequired: true,
        },
      });
      expect(q6.statusCode).toBe(201);

      // Fetch survey with questions
      const getRes = await app.inject({
        method: 'GET',
        url: `/me/surveys/${surveyId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().questions).toHaveLength(6);
    });

    it('allows updating questions before any response exists', async () => {
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/me/surveys/${surveyId}/questions/${textQId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          text: 'Primary Respondent Full Legal Name',
        },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().text).toBe('Primary Respondent Full Legal Name');
    });

    it('enforces question freeze (409 Conflict) once responses exist', async () => {
      // 1. Submit a response
      const responseRes = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          surveyId,
          schemeId: KANO_SCHEME_ID,
          answers: [
            { questionCode: 'Q_NAME', value: 'Ibrahim Musa' },
            { questionCode: 'Q_INCOME', value: 350000 },
            { questionCode: 'Q_GENDER', value: 'Male' },
            { questionCode: 'Q_CROPS', value: ['Rice', 'Maize'] },
            { questionCode: 'Q_DOB', value: '1985-06-15' },
            { questionCode: 'Q_LOC', value: [12.002, 8.591] }, // Kano GPS
          ],
        },
      });
      expect(responseRes.statusCode).toBe(201);

      // 2. Attempt to add a question on the frozen survey -> 409
      const addRes = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_EXTRA',
          text: 'Extra question',
          answerType: 'text',
          sortOrder: 7,
        },
      });
      expect(addRes.statusCode).toBe(409);
      expect(addRes.json().detail).toContain('responses');

      // 3. Attempt to update a question on the frozen survey -> 409
      const editRes = await app.inject({
        method: 'PUT',
        url: `/me/surveys/${surveyId}/questions/${textQId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          text: 'Attempt to change question',
        },
      });
      expect(editRes.statusCode).toBe(409);
      expect(editRes.json().detail).toContain('responses');

      // 4. Attempt to delete a question on the frozen survey -> 409
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/me/surveys/${surveyId}/questions/${textQId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(delRes.statusCode).toBe(409);
      expect(delRes.json().detail).toContain('responses');
    });

    it('clones survey to a new version to allow modifying questions', async () => {
      const versionRes = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/version`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(versionRes.statusCode).toBe(201);
      const newVersion = versionRes.json();
      expect(newVersion.id).not.toBe(surveyId);
      expect(newVersion.version).toBe(2);
      expect(newVersion.name).toBe('Farmer Household Survey 2026');

      // The new version has cloned questions
      const getNewRes = await app.inject({
        method: 'GET',
        url: `/me/surveys/${newVersion.id}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(getNewRes.statusCode).toBe(200);
      expect(getNewRes.json().questions).toHaveLength(6);

      // New version has 0 responses, so adding questions succeeds!
      const addRes = await app.inject({
        method: 'POST',
        url: `/me/surveys/${newVersion.id}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'Q_LAND_AREA',
          text: 'Farm Area in Hectares',
          answerType: 'number',
          sortOrder: 7,
          isRequired: false,
        },
      });
      expect(addRes.statusCode).toBe(201);
    });

    it('enforces scope: Lagos officer cannot create response for Kano survey (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
        payload: {
          surveyId,
          schemeId: KANO_SCHEME_ID,
          answers: [
            { questionCode: 'Q_NAME', value: 'Ibrahim Musa' },
            { questionCode: 'Q_INCOME', value: 350000 },
            { questionCode: 'Q_GENDER', value: 'Male' },
            { questionCode: 'Q_CROPS', value: ['Rice'] },
            { questionCode: 'Q_DOB', value: '1985-06-15' },
            { questionCode: 'Q_LOC', value: [8.591, 12.002] },
          ],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows national lead to list surveys across all schemes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me/surveys',
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Typed Answer Validation (BE-3.4)', () => {
    let surveyId: string;

    beforeAll(async () => {
      // Create a survey with all question types
      const res = await app.inject({
        method: 'POST',
        url: '/me/surveys',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          name: 'Typed Validation Survey',
          schemeId: KANO_SCHEME_ID,
        },
      });
      surveyId = res.json().id;

      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'TXT',
          text: 'Text Q',
          answerType: 'text',
          sortOrder: 1,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'NUM',
          text: 'Number Q',
          answerType: 'number',
          sortOrder: 2,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'SGL',
          text: 'Single Q',
          answerType: 'single',
          options: ['A', 'B', 'C'],
          sortOrder: 3,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'MLT',
          text: 'Multi Q',
          answerType: 'multi',
          options: ['X', 'Y', 'Z'],
          sortOrder: 4,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'DAT',
          text: 'Date Q',
          answerType: 'date',
          sortOrder: 5,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { code: 'GPS', text: 'GPS Q', answerType: 'gps', sortOrder: 6, isRequired: true },
      });
    });

    const baseValidAnswers = [
      { questionCode: 'TXT', value: 'Valid text' },
      { questionCode: 'NUM', value: 125.5 },
      { questionCode: 'SGL', value: 'A' },
      { questionCode: 'MLT', value: ['X', 'Y'] },
      { questionCode: 'DAT', value: '2026-05-20' },
      { questionCode: 'GPS', value: [11.98, 8.52] }, // Valid Kano location
    ];

    it('accepts completely valid typed answers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          surveyId,
          schemeId: KANO_SCHEME_ID,
          answers: baseValidAnswers,
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects invalid number (non-numeric)', async () => {
      const invalid = baseValidAnswers.map((a) =>
        a.questionCode === 'NUM' ? { ...a, value: 'not-a-number' } : a,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('valid number');
    });

    it('rejects invalid single choice (choice not in allowed options)', async () => {
      const invalid = baseValidAnswers.map((a) =>
        a.questionCode === 'SGL' ? { ...a, value: 'InvalidOption' } : a,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('not a valid choice');
    });

    it('rejects invalid multi choice (item not in allowed options)', async () => {
      const invalid = baseValidAnswers.map((a) =>
        a.questionCode === 'MLT' ? { ...a, value: ['X', 'ForbiddenItem'] } : a,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('invalid');
    });

    it('rejects invalid date (not ISO YYYY-MM-DD)', async () => {
      const invalid = baseValidAnswers.map((a) =>
        a.questionCode === 'DAT' ? { ...a, value: '2026/05/20' } : a,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('YYYY-MM-DD');
    });

    it('rejects GPS coordinates outside Nigeria', async () => {
      // London coordinates: lat 51.5074, lon -0.1278
      const invalid = baseValidAnswers.map((a) =>
        a.questionCode === 'GPS' ? { ...a, value: [51.5074, -0.1278] } : a,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('Nigeria');
    });

    it('rejects missing required questions', async () => {
      // Omit 'TXT' question
      const missing = baseValidAnswers.filter((a) => a.questionCode !== 'TXT');
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: { surveyId, schemeId: KANO_SCHEME_ID, answers: missing },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('was not answered');
    });

    it('rejects field officer response without schemeId with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          surveyId,
          // schemeId omitted
          answers: baseValidAnswers,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('schemeId is required');
    });

    it('allows a state-scope user to respond for a scheme in their state', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: {
          surveyId,
          schemeId: KANO_SCHEME_ID,
          answers: baseValidAnswers,
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects a response for scheme B on a scheme-A survey with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/surveys/${surveyId}/responses`,
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          surveyId, // surveyId is tied to KANO_SCHEME_ID
          schemeId: LAGOS_SCHEME_ID, // mismatch
          answers: baseValidAnswers,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('response scheme must match');
    });
  });

  describe('Offline Sync Push & Pull for Survey Responses (BE-3.4)', () => {
    let syncSurveyId: string;
    let syncQId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/surveys',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          name: 'Offline Field Sync Survey',
          schemeId: KANO_SCHEME_ID,
        },
      });
      syncSurveyId = res.json().id;

      const qRes = await app.inject({
        method: 'POST',
        url: `/me/surveys/${syncSurveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'SYNC_REMARK',
          text: 'Field Officer Observations',
          answerType: 'text',
          sortOrder: 1,
          isRequired: true,
        },
      });
      syncQId = qRes.json().id;
    });

    it('applies offline captured survey_response push atomically and makes it available on pull', async () => {
      const offlineResponseId = crypto.randomUUID();
      const opId = crypto.randomUUID();

      // 1. Field officer pushes offline survey response
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: FIELD_DEVICE_ID,
          ops: [
            {
              opId,
              entity: 'survey_response',
              action: 'create',
              recordId: offlineResponseId,
              baseVersion: 1,
              data: {
                surveyId: syncSurveyId,
                schemeId: KANO_SCHEME_ID,
                collectedAt: new Date().toISOString(),
                location: [12.01, 8.53],
                answers: [
                  {
                    questionId: syncQId,
                    questionCode: 'SYNC_REMARK',
                    value: 'Field irrigation channel inspection completed offline',
                  },
                ],
              },
            },
          ],
        },
      });
      expect(pushRes.statusCode).toBe(201);
      const pushData = pushRes.json();
      expect(pushData.results).toHaveLength(1);
      expect(pushData.results[0].outcome).toBe('applied');

      // 2. Verify record in DB
      const [savedResponse] = await testDb
        .select()
        .from(surveyResponse)
        .where(eq(surveyResponse.id, offlineResponseId));
      expect(savedResponse).toBeDefined();
      expect(savedResponse?.surveyId).toBe(syncSurveyId);
      expect(savedResponse?.schemeId).toBe(KANO_SCHEME_ID);
      expect(savedResponse?.status).toBe('submitted');

      const savedAnswers = await testDb
        .select()
        .from(surveyAnswer)
        .where(eq(surveyAnswer.responseId, offlineResponseId));
      expect(savedAnswers).toHaveLength(1);
      expect(savedAnswers[0].value).toBe('Field irrigation channel inspection completed offline');

      // 3. Field officer pulls changes -> receives the new survey_response
      const pullRes = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': FIELD_DEVICE_ID,
        },
      });
      expect(pullRes.statusCode).toBe(200);
      const pullData = pullRes.json();
      const responseChange = pullData.items.find(
        (c: { entity: string; recordId: string }) =>
          c.entity === 'survey_response' && c.recordId === offlineResponseId,
      );
      expect(responseChange).toBeDefined();
      expect(responseChange.op).toBe('upsert');
    });

    it('rejects offline survey_response push without schemeId for scoped field officer', async () => {
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: FIELD_DEVICE_ID,
          ops: [
            {
              opId: crypto.randomUUID(),
              entity: 'survey_response',
              action: 'create',
              recordId: crypto.randomUUID(),
              baseVersion: 1,
              data: {
                surveyId: syncSurveyId,
                // missing schemeId
                answers: [{ questionId: syncQId, value: 'Observations' }],
              },
            },
          ],
        },
      });
      expect(pushRes.statusCode).toBe(201);
      const pushData = pushRes.json();
      expect(pushData.results[0].outcome).toBe('rejected');
    });

    it('rejects offline survey_response push for scheme B on scheme-A survey', async () => {
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: FIELD_DEVICE_ID,
          ops: [
            {
              opId: crypto.randomUUID(),
              entity: 'survey_response',
              action: 'create',
              recordId: crypto.randomUUID(),
              baseVersion: 1,
              data: {
                surveyId: syncSurveyId,
                schemeId: LAGOS_SCHEME_ID, // mismatch
                answers: [{ questionId: syncQId, value: 'Observations' }],
              },
            },
          ],
        },
      });
      expect(pushRes.statusCode).toBe(201);
      const pushData = pushRes.json();
      expect(pushData.results[0].outcome).toBe('rejected');
    });

    it('applies offline survey_response push for state-scope user on a scheme in their state', async () => {
      const stateResponseId = crypto.randomUUID();
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: {
          deviceId: STATE_DEVICE_ID,
          ops: [
            {
              opId: crypto.randomUUID(),
              entity: 'survey_response',
              action: 'create',
              recordId: stateResponseId,
              baseVersion: 1,
              data: {
                surveyId: syncSurveyId,
                schemeId: KANO_SCHEME_ID,
                answers: [{ questionId: syncQId, value: 'State Officer Inspection' }],
              },
            },
          ],
        },
      });
      expect(pushRes.statusCode).toBe(201);
      const pushData = pushRes.json();
      expect(pushData.results[0].outcome).toBe('applied');
    });
  });

  describe('Survey Response Import Round-Trip (BE-3.4)', () => {
    let importSurveyId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/surveys',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          name: 'Annual Beneficiary Survey',
          schemeId: KANO_SCHEME_ID,
        },
      });
      importSurveyId = res.json().id;

      await app.inject({
        method: 'POST',
        url: `/me/surveys/${importSurveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'SATISFACTION',
          text: 'Service Satisfaction',
          answerType: 'single',
          options: ['High', 'Medium', 'Low'],
          sortOrder: 1,
          isRequired: true,
        },
      });
      await app.inject({
        method: 'POST',
        url: `/me/surveys/${importSurveyId}/questions`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          code: 'ACRES',
          text: 'Farmed Acres',
          answerType: 'number',
          sortOrder: 2,
          isRequired: true,
        },
      });
    });

    const createImportWorkbookBuffer = async (rows: Record<string, unknown>[]) => {
      const workbook = new ExcelJS.Workbook();
      const version = 1;
      const dataset = 'me.survey_response';
      workbook.description = JSON.stringify({ dataset, version });
      workbook.keywords = `templateVersion:${version};dataset:${dataset}`;
      workbook.subject = String(version);
      const metaSheet = workbook.addWorksheet('_metadata');
      metaSheet.state = 'veryHidden';
      metaSheet.getCell('A1').value = 'template_version';
      metaSheet.getCell('B1').value = version;
      metaSheet.getCell('A2').value = 'dataset';
      metaSheet.getCell('B2').value = dataset;

      const sheet = workbook.addWorksheet('Data');
      const columns = ME_IMPORT_TEMPLATES['me.survey_response'];

      sheet.columns = columns.map((col) => ({
        header: `${col.header}${col.required ? ' *' : ''}`,
        key: col.name,
        width: 20,
      }));

      for (const r of rows) {
        sheet.addRow(r);
      }
      return Buffer.from(await workbook.xlsx.writeBuffer());
    };

    const uploadAndValidate = async (rows: Record<string, unknown>[], token: string) => {
      const buf = await createImportWorkbookBuffer(rows);
      const fileId = crypto.randomUUID();
      const storageKey = `imports/${fileId}.xlsx`;
      mockStorageFiles.set(storageKey, buf);

      const now = new Date().toISOString();
      await testDb.insert(file).values({
        id: fileId,
        storageKey,
        originalName: 'survey_response_import.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        scanStatus: 'clean',
        createdAt: now,
        createdBy: KANO_ME_OFFICER_ID,
        updatedAt: now,
        updatedBy: KANO_ME_OFFICER_ID,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileId,
          dataset: 'me.survey_response',
          schemeId: KANO_SCHEME_ID,
        },
      });
      expect(res.statusCode).toBe(201);
      const batch = res.json();

      let validatedBatch = batch;
      for (let i = 0; i < 30; i++) {
        const getRes = await app.inject({
          method: 'GET',
          url: `/imports/${batch.id}`,
          headers: { authorization: `Bearer ${token}` },
        });
        validatedBatch = getRes.json();
        if (
          validatedBatch.status === 'validated' ||
          validatedBatch.status === 'validation_failed'
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      return validatedBatch;
    };

    it('completes template → fill → upload → preview → commit → undo round trip', async () => {
      // 1. Template
      const templateRes = await app.inject({
        method: 'GET',
        url: '/imports/template/me.survey_response',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(templateRes.statusCode).toBe(200);

      // 2. Upload valid survey response
      const answersJson = JSON.stringify({
        SATISFACTION: 'High',
        ACRES: 4.5,
      });

      const batch = await uploadAndValidate(
        [
          {
            surveyName: 'Annual Beneficiary Survey',
            surveyId: importSurveyId,
            schemeCode: 'KRIS',
            respondentId: 'RESP-BEN-001',
            respondentPhone: '+2348031234567',
            period: '2026-Q1',
            collectedAt: '2026-03-15T10:00:00.000Z',
            answers: answersJson,
          },
        ],
        kanoOfficerToken,
      );
      expect(batch.status).toBe('validated');

      // 3. Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const previewData = previewRes.json();
      expect(previewData.rows[0].status).toBe('valid');

      // 4. Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      // Verify committed survey_response is in 'submitted' status with submitted_by = committing user
      const [sr] = await testDb
        .select()
        .from(surveyResponse)
        .where(and(eq(surveyResponse.surveyId, importSurveyId), isNull(surveyResponse.deletedAt)));
      expect(sr).toBeDefined();
      expect(sr?.status).toBe('submitted');
      expect(sr?.submittedBy).toBe(KANO_ME_OFFICER_ID);

      // Verify committed answers
      const answers = await testDb
        .select()
        .from(surveyAnswer)
        .where(eq(surveyAnswer.responseId, sr.id));
      expect(answers).toHaveLength(2);

      // 5. Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      expect(undoRes.json().status).toBe('undone');

      // Verify survey_response is soft deleted
      const [srAfter] = await testDb
        .select()
        .from(surveyResponse)
        .where(and(eq(surveyResponse.surveyId, importSurveyId), isNull(surveyResponse.deletedAt)));
      expect(srAfter).toBeUndefined();
    });

    it('fails validation when scoped user omits schemeCode in import row', async () => {
      const answersJson = JSON.stringify({ SATISFACTION: 'High', ACRES: 15 });
      const batch = await uploadAndValidate(
        [
          {
            surveyName: 'Annual Beneficiary Survey',
            surveyId: importSurveyId,
            // schemeCode omitted!
            respondentId: 'RESP-NO-SCHEME',
            period: '2026-Q1',
            answers: answersJson,
          },
        ],
        kanoOfficerToken,
      );
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorRows).toBeGreaterThan(0);
    });

    it('fails validation when import row specifies scheme B for a scheme-A survey', async () => {
      const answersJson = JSON.stringify({ SATISFACTION: 'High', ACRES: 15 });
      const batch = await uploadAndValidate(
        [
          {
            surveyName: 'Annual Beneficiary Survey',
            surveyId: importSurveyId,
            schemeCode: 'LRIS', // Lagos scheme on Kano survey
            respondentId: 'RESP-MISMATCH',
            period: '2026-Q1',
            answers: answersJson,
          },
        ],
        kanoOfficerToken,
      );
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorRows).toBeGreaterThan(0);
    });

    it('succeeds validation and commit when state-scope user imports for a scheme in their state', async () => {
      const answersJson = JSON.stringify({ SATISFACTION: 'Low', ACRES: 25 });
      const batch = await uploadAndValidate(
        [
          {
            surveyName: 'Annual Beneficiary Survey',
            surveyId: importSurveyId,
            schemeCode: 'KRIS', // Kano scheme in Kano state
            respondentId: 'RESP-STATE-OK',
            period: '2026-Q1',
            answers: answersJson,
          },
        ],
        kanoStateOfficerToken,
      );
      expect(batch.status).toBe('validated');
      expect(batch.errorRows).toBe(0);

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);
    });
  });
});
