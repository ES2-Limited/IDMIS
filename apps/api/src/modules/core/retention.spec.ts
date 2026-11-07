import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { permissions } from '@idmis/contracts';
import {
  db,
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  SYSTEM_USER_ID,
  state,
} from '@idmis/db';

describe('System Data Retention API (BE-5.3)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;

  const ADMIN_USER_ID = crypto.randomUUID();
  const OFFICER_USER_ID = crypto.randomUUID();
  const SYSADMIN_ROLE_ID = crypto.randomUUID();
  const FIELD_OFFICER_ROLE_ID = crypto.randomUUID();
  const KANO_STATE_ID = crypto.randomUUID();

  let adminToken: string;
  let officerToken: string;

  beforeAll(async () => {
    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: ['error', 'warn'],
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);

    const passHash = await argon2.hash('Secret1234!');

    // 1. Seed System User if not present
    await db
      .insert(appUser)
      .values({
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System User',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();

    // 2. Seed State
    await db
      .insert(state)
      .values({
        id: KANO_STATE_ID,
        code: `KAN_${Date.now()}`,
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();

    // 3. Seed Roles
    await db.insert(role).values([
      {
        id: SYSADMIN_ROLE_ID,
        key: `sysadmin_${Date.now()}`,
        name: 'System Admin Role',
        isSystem: true,
      },
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: `officer_${Date.now()}`,
        name: 'Field Officer Role',
        isSystem: false,
      },
    ]);

    // 4. Seed Permissions
    await db.insert(rolePermission).values([
      { roleId: SYSADMIN_ROLE_ID, permission: permissions.SYSTEM_RETENTION_RUN },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_READ },
    ]);

    // 5. Seed Users: Admin has totpConfirmedAt set
    await db.insert(appUser).values([
      {
        id: ADMIN_USER_ID,
        email: `sysadmin_${Date.now()}@idmis.gov.ng`,
        fullName: 'System Admin',
        passwordHash: passHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: OFFICER_USER_ID,
        email: `officer_${Date.now()}@idmis.gov.ng`,
        fullName: 'Field Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 6. Seed Assignments
    await db.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: ADMIN_USER_ID,
        roleId: SYSADMIN_ROLE_ID,
        module: 'core',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: OFFICER_USER_ID,
        roleId: FIELD_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 7. Seed Sessions & Access Tokens
    const sidAdmin = crypto.randomUUID();
    await db.insert(session).values({
      id: sidAdmin,
      familyId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const adminAuth = await tokenService.createAccessToken(ADMIN_USER_ID, sidAdmin);
    adminToken = adminAuth.accessToken;

    const sidOfficer = crypto.randomUUID();
    await db.insert(session).values({
      id: sidOfficer,
      familyId: crypto.randomUUID(),
      userId: OFFICER_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const officerAuth = await tokenService.createAccessToken(OFFICER_USER_ID, sidOfficer);
    officerToken = officerAuth.accessToken;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/system/retention/run',
      payload: { dryRun: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-sysadmin users with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/system/retention/run',
      headers: {
        authorization: `Bearer ${officerToken}`,
      },
      payload: { dryRun: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.status).toBe(403);
  });

  it('allows sysadmin to trigger dry-run retention job (200 with jobId and dryRun)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/system/retention/run',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: { dryRun: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeDefined();
    expect(typeof body.jobId).toBe('string');
    expect(body.dryRun).toBe(true);
  });

  it('allows sysadmin to trigger live retention job (200 with jobId and dryRun=false)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/system/retention/run',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: { dryRun: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeDefined();
    expect(typeof body.jobId).toBe('string');
    expect(body.dryRun).toBe(false);
  });
});
