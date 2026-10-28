import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  appUser,
  assignment,
  auditLog,
  outboxEvent,
  session,
  role,
  rolePermission,
  SYSTEM_USER_ID,
  ROLE_SYSTEM_ADMIN_ID,
  SYSTEM_ROLE_PERMISSIONS,
  postgres,
  drizzle,
  setDatabaseUrl,
  migrate,
  eq,
  count,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../filters';
import { TokenService } from '../../modules/auth/token.service';
import { runInTransaction } from '../database/transaction.helper';
import { enqueueOutboxEvent } from './outbox.service';

describe('Outbox API & Admin Endpoints Specification (BE-1.5)', () => {
  const TEST_DB_NAME = `idmis_outbox_api_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  let app: NestFastifyApplication;
  let tokenService: TokenService;

  const USER_SYSADMIN_ID = '018f3a5e-1000-7000-8000-000000000001';
  const USER_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    // Apply migrations
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    // Seed roles and permissions
    await testDb.insert(role).values([
      {
        id: ROLE_SYSTEM_ADMIN_ID,
        key: 'system_admin',
        name: 'System Admin',
        isSystem: true,
      },
      {
        id: '018f3a5e-0000-7000-8000-000000000014',
        key: 'field_officer',
        name: 'Field Officer',
        isSystem: true,
      },
    ]);

    const sysAdminPerms = SYSTEM_ROLE_PERMISSIONS.system_admin.map((perm) => ({
      roleId: ROLE_SYSTEM_ADMIN_ID,
      permission: perm,
    }));
    await testDb.insert(rolePermission).values(sysAdminPerms);

    // Seed users
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System Daemon',
        passwordHash: 'dummy_hash',
      },
      {
        id: USER_SYSADMIN_ID,
        email: 'sysadmin@idmis.gov.ng',
        fullName: 'System Admin',
        passwordHash: 'dummy_hash',
      },
      {
        id: USER_OFFICER_ID,
        email: 'officer@idmis.gov.ng',
        fullName: 'Field Officer',
        passwordHash: 'dummy_hash',
      },
    ]);

    // System admin assignment
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: USER_SYSADMIN_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Start Nest App
    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testClient) {
      await testClient.end();
    }
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore
      }
      await adminClient.end();
    }
  });

  async function createToken(userId: string): Promise<string> {
    const sid = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sid,
      familyId: sid,
      userId,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const { accessToken } = await tokenService.createAccessToken(userId, sid);
    return accessToken;
  }

  describe('1. Transaction Atomicity & Outbox Enqueueing', () => {
    it('leaves NO business rows, NO audit rows, and NO outbox rows when transaction fails', async () => {
      const initialUsers = await testDb.select({ count: count() }).from(appUser);
      const initialAudits = await testDb.select({ count: count() }).from(auditLog);
      const initialEvents = await testDb.select({ count: count() }).from(outboxEvent);

      await expect(
        runInTransaction(
          async (tx) => {
            // 1. Business write
            await tx.insert(appUser).values({
              id: crypto.randomUUID(),
              email: 'failed_tx@example.com',
              fullName: 'Failed Tx User',
              passwordHash: 'hash',
            });

            // 2. Outbox write
            await enqueueOutboxEvent(tx, {
              eventType: 'core.assignment.changed',
              aggregateType: 'assignment',
              aggregateId: 'failed_tx_id',
              payload: { test: true },
            });

            // 3. Throw fatal error triggering transaction rollback
            throw new Error('Simulated atomic transaction failure');
          },
          {
            db: testDb,
            audit: {
              action: 'create',
              entity: 'app_user',
              entityId: 'failed_tx_id',
            },
          },
        ),
      ).rejects.toThrow('Simulated atomic transaction failure');

      const afterUsers = await testDb.select({ count: count() }).from(appUser);
      const afterAudits = await testDb.select({ count: count() }).from(auditLog);
      const afterEvents = await testDb.select({ count: count() }).from(outboxEvent);

      expect(afterUsers[0].count).toBe(initialUsers[0].count);
      expect(afterAudits[0].count).toBe(initialAudits[0].count);
      expect(afterEvents[0].count).toBe(initialEvents[0].count);
    });

    it('successfully enqueues outbox event inside transaction along with business change', async () => {
      let eventId: string;
      await runInTransaction(
        async (tx) => {
          eventId = await enqueueOutboxEvent(tx, {
            eventType: 'core.assignment.changed',
            aggregateType: 'assignment',
            aggregateId: 'assign_success_id',
            payload: { userId: USER_OFFICER_ID, changeType: 'created' },
          });
        },
        { db: testDb },
      );

      const [stored] = await testDb.select().from(outboxEvent).where(eq(outboxEvent.id, eventId!));

      expect(stored).toBeDefined();
      expect(stored.eventType).toBe('core.assignment.changed');
      expect(stored.attempts).toBe(0);
      expect(stored.deliveredAt).toBeNull();
      expect(stored.deadAt).toBeNull();
    });
  });

  describe('2. Dead Event Requeue & Admin API Endpoints', () => {
    let deadEventId: string;

    beforeAll(async () => {
      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: 'assign_dead_test',
          payload: { userId: USER_OFFICER_ID, changeType: 'deleted' },
          attempts: 12,
          lastError: 'Fatal error during dispatch',
          deadAt: new Date().toISOString(),
        })
        .returning();
      deadEventId = inserted.id;
    });

    it('GET /admin/outbox/dead: returns list of dead events for system admin', async () => {
      const token = await createToken(USER_SYSADMIN_ID);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/outbox/dead',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBeGreaterThan(0);
      const found = body.items.find((i: { id: string }) => i.id === deadEventId);
      expect(found).toBeDefined();
      expect(found.attempts).toBe(12);
    });

    it('POST /admin/outbox/:id/requeue: resets dead event to available', async () => {
      const token = await createToken(USER_SYSADMIN_ID);

      const res = await app.inject({
        method: 'POST',
        url: `/admin/outbox/${deadEventId}/requeue`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.requeued).toBe(true);
      expect(body.id).toBe(deadEventId);

      const [stored] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.id, deadEventId));

      expect(stored.deadAt).toBeNull();
      expect(stored.attempts).toBe(0);
      expect(stored.lastError).toBeNull();
    });

    it('returns 403 Forbidden when non-admin attempts to access outbox admin endpoints', async () => {
      const token = await createToken(USER_OFFICER_ID);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/outbox/dead',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
