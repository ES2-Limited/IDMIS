import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  appUser,
  assignment,
  outboxEvent,
  outboxConsumption,
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
} from '@idmis/db';
import * as schema from '@idmis/db';
import { SubscriberRegistry } from './dispatcher/registry';
import { dispatchBatch } from './dispatcher/dispatcher';
import { registerAuthzSubscribers, type RedisClientLike } from './subscribers/authz.subscriber';

describe('Worker Dispatcher & Subscribers Specification (BE-1.5)', () => {
  const TEST_DB_NAME = `idmis_worker_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;
  let registry: SubscriberRegistry;

  const USER_SYSADMIN_ID = '018f3a5e-1000-7000-8000-000000000001';
  const USER_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    // Apply migrations
    const migrationsFolder = path.resolve(__dirname, '../../../packages/db/migrations');
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
  });

  afterAll(async () => {
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

  beforeEach(async () => {
    registry = new SubscriberRegistry();
    if (testDb) {
      await testDb.delete(outboxConsumption);
      await testDb.delete(outboxEvent);
    }
  });

  describe('1. Contracts Catalogue Rules (Known Noop vs Unknown Dead-Letter)', () => {
    it('marks event delivered (noop) when event type is in catalogue but has NO subscribers', async () => {
      const emptyRegistry = new SubscriberRegistry();
      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.role_permission.changed', // In catalogue, but emptyRegistry has no handlers
          aggregateType: 'role_permission',
          aggregateId: 'role_1',
          payload: { roleId: ROLE_SYSTEM_ADMIN_ID, action: 'reconciled' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      const result = await dispatchBatch(testDb, emptyRegistry);
      expect(result.delivered).toBe(1);

      const [stored] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.id, inserted.id));

      expect(stored.deliveredAt).not.toBeNull();
      expect(stored.deadAt).toBeNull();
    });

    it('dead-letters event immediately and logs error when event type is NOT in catalogue', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const emptyRegistry = new SubscriberRegistry();

      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'unregistered.bogus.event_type',
          aggregateType: 'bogus',
          aggregateId: 'bogus_1',
          payload: { foo: 'bar' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      const result = await dispatchBatch(testDb, emptyRegistry);
      expect(result.deadLettered).toBe(1);

      const [stored] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.id, inserted.id));

      expect(stored.deadAt).not.toBeNull();
      expect(stored.deliveredAt).toBeNull();
      expect(stored.lastError).toContain('Unknown event type');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('2. Dispatcher Execution, Deduplication, Retries & Dead-Letter', () => {
    it('delivers event successfully and marks delivered_at', async () => {
      const handlerMock = vi.fn().mockResolvedValue(undefined);
      registry.register('core.assignment.changed', 'test-handler-success', handlerMock);

      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: 'assign_1',
          payload: { userId: USER_OFFICER_ID, changeType: 'created' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      const res = await dispatchBatch(testDb, registry);
      expect(res.delivered).toBe(1);
      expect(handlerMock).toHaveBeenCalledTimes(1);

      const [stored] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.id, inserted.id));

      expect(stored.deliveredAt).not.toBeNull();
      expect(stored.deadAt).toBeNull();

      // Consumption record recorded
      const [consumption] = await testDb
        .select()
        .from(outboxConsumption)
        .where(eq(outboxConsumption.eventId, inserted.id));
      expect(consumption).toBeDefined();
      expect(consumption.handlerName).toBe('test-handler-success');
    });

    it('enforces idempotent deduplication: does not run handler twice for the same event', async () => {
      const duplicateHandlerMock = vi.fn().mockResolvedValue(undefined);
      registry.register('core.assignment.changed', 'dedupe-handler', duplicateHandlerMock);

      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: 'assign_dedupe',
          payload: { userId: USER_OFFICER_ID, changeType: 'created' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      // First run: delivers
      await dispatchBatch(testDb, registry);
      expect(duplicateHandlerMock).toHaveBeenCalledTimes(1);

      // Artificially reset deliveredAt to simulate redelivery
      await testDb
        .update(outboxEvent)
        .set({
          deliveredAt: null,
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .where(eq(outboxEvent.id, inserted.id));

      // Second run: handler must NOT execute again
      await dispatchBatch(testDb, registry);
      expect(duplicateHandlerMock).toHaveBeenCalledTimes(1);
    });

    it('retries with exponential backoff and dead-letters after 12 attempts', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Flaky external service failure'));
      registry.register('core.assignment.changed', 'failing-handler', failingHandler);

      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: 'assign_flaky',
          payload: { userId: USER_OFFICER_ID, changeType: 'created' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      // Attempt 1: fails, backoff scheduled
      const res1 = await dispatchBatch(testDb, registry);
      expect(res1.failed).toBe(1);

      let [stored] = await testDb.select().from(outboxEvent).where(eq(outboxEvent.id, inserted.id));
      expect(stored.attempts).toBe(1);
      expect(stored.deadAt).toBeNull();
      expect(stored.lastError).toContain('Flaky external service failure');

      // Fast-forward attempts to 11
      await testDb
        .update(outboxEvent)
        .set({
          attempts: 11,
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .where(eq(outboxEvent.id, inserted.id));

      // Attempt 12: reaches MAX_ATTEMPTS (12) -> dead letter!
      const res12 = await dispatchBatch(testDb, registry);
      expect(res12.deadLettered).toBe(1);

      [stored] = await testDb.select().from(outboxEvent).where(eq(outboxEvent.id, inserted.id));

      expect(stored.attempts).toBe(12);
      expect(stored.deadAt).not.toBeNull();
      expect(stored.deliveredAt).toBeNull();
    });

    it('enforces per-handler timeout and triggers failure backoff', async () => {
      const slowHandler = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)));
      registry.register('core.assignment.changed', 'slow-handler', slowHandler, { timeoutMs: 50 });

      const [inserted] = await testDb
        .insert(outboxEvent)
        .values({
          id: crypto.randomUUID(),
          eventType: 'core.assignment.changed',
          aggregateType: 'assignment',
          aggregateId: 'assign_timeout',
          payload: { userId: USER_OFFICER_ID, changeType: 'created' },
          availableAt: new Date(Date.now() - 1000).toISOString(),
        })
        .returning();

      const res = await dispatchBatch(testDb, registry);
      expect(res.failed).toBe(1);

      const [stored] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.id, inserted.id));
      expect(stored.lastError).toContain("Handler 'slow-handler' timed out after 50ms");
    });
  });

  describe('3. Asynchronous Cache Invalidation Subscriber', () => {
    it('evicts user authz cache and increments epoch', async () => {
      const memoryStore = new Map<string, string>();
      const mockRedisClient: RedisClientLike = {
        async get(k: string) {
          return memoryStore.get(k) ?? null;
        },
        async del(k: string) {
          memoryStore.delete(k);
        },
        async incr(k: string) {
          const current = parseInt(memoryStore.get(k) ?? '0', 10);
          const next = current + 1;
          memoryStore.set(k, String(next));
          return next;
        },
      };

      const authzRegistry = new SubscriberRegistry();
      registerAuthzSubscribers(authzRegistry, mockRedisClient);

      // 1. User eviction test
      const cacheKey = `auth:user:${USER_OFFICER_ID}:epoch:1`;
      memoryStore.set(cacheKey, JSON.stringify({ cached: true }));
      expect(await mockRedisClient.get(cacheKey)).not.toBeNull();

      await testDb.insert(outboxEvent).values({
        id: crypto.randomUUID(),
        eventType: 'core.assignment.changed',
        aggregateType: 'assignment',
        aggregateId: 'assign_cache_test',
        payload: { userId: USER_OFFICER_ID, changeType: 'created' },
        availableAt: new Date(Date.now() - 1000).toISOString(),
      });

      await dispatchBatch(testDb, authzRegistry);
      expect(await mockRedisClient.get(cacheKey)).toBeNull();

      // 2. Epoch increment test
      expect(await mockRedisClient.get('auth:rbac:epoch')).toBeNull();
      await testDb.insert(outboxEvent).values({
        id: crypto.randomUUID(),
        eventType: 'core.role_permission.changed',
        aggregateType: 'role_permission',
        aggregateId: 'rp_test',
        payload: { roleId: ROLE_SYSTEM_ADMIN_ID, action: 'reconciled' },
        availableAt: new Date(Date.now() - 1000).toISOString(),
      });

      await dispatchBatch(testDb, authzRegistry);
      expect(await mockRedisClient.get('auth:rbac:epoch')).toBe('1');
    });
  });
});
