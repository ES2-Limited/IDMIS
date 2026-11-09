import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import {
  postgres,
  drizzle,
  setDatabaseUrl,
  sql,
  appUser,
  farmer,
  organisation,
  state,
  SYSTEM_USER_ID,
  migrate,
} from '@idmis/db';
import { MeComputeService } from './services/me-compute.service';
import { ComputeRegistry } from './compute/compute.registry';
import { ComputeResultRepository } from './repositories/compute-result.repository';
import { IndicatorValueRepository } from './repositories/indicator-value.repository';
import { IndicatorMatrixRepository } from './repositories/indicator-matrix.repository';
import { SlisComputeQueryService } from '../slis/services/slis-compute-query.service';
import { BlisComputeQueryService } from '../blis/services/blis-compute-query.service';
import { eventBus } from '../../platform/events/event-bus';

interface TestJob {
  id: string;
  name: string;
  data: unknown;
  delay: number;
  timestamp: number;
  opts: Record<string, unknown>;
  remove: () => Promise<void>;
}

interface TestJobOpts {
  jobId?: string;
  delay?: number;
  [key: string]: unknown;
}

class InMemoryTestQueue {
  private jobs = new Map<string, TestJob>();

  async add(name: string, data: unknown, opts?: TestJobOpts): Promise<TestJob> {
    if (opts?.jobId && this.jobs.has(opts.jobId)) {
      return this.jobs.get(opts.jobId)!;
    }
    const job: TestJob = {
      id: opts?.jobId || crypto.randomUUID(),
      name,
      data,
      delay: opts?.delay || 0,
      timestamp: Date.now(),
      opts: opts || {},
      remove: async () => {
        this.jobs.delete(opts?.jobId || job.id);
      },
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJobs(): Promise<TestJob[]> {
    return Array.from(this.jobs.values());
  }

  async getJob(jobId: string): Promise<TestJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async drain(): Promise<void> {
    this.jobs.clear();
  }

  async obliterate(): Promise<void> {
    this.jobs.clear();
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }
}

describe('M&E Compute Storm Fix: Debounce & Query Invariance', () => {
  const TEST_DB_NAME = `idmis_test_compute_storm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  let computeService: MeComputeService;
  let slisQueryService: SlisComputeQueryService;
  let testQueue: Queue;
  let isRedisConnected = false;
  const QUEUE_NAME = `test-me-compute-storm-${Date.now()}`;

  const SCHEME_ID = crypto.randomUUID();
  const STATE_ID = crypto.randomUUID();

  const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
  const ORIGINAL_QUEUE_NAME = process.env.ME_COMPUTE_QUEUE_NAME;
  const ORIGINAL_DEBOUNCE_MS = process.env.ME_COMPUTE_DEBOUNCE_MS;

  beforeAll(async () => {
    // 1. Create isolated DB and run migrations
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.ME_COMPUTE_QUEUE_NAME = QUEUE_NAME;
    process.env.ME_COMPUTE_DEBOUNCE_MS = '60000';

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    // 2. Set up services
    const registry = new ComputeRegistry(
      null as unknown as SlisComputeQueryService,
      null as unknown as BlisComputeQueryService,
    );
    const computeResultRepo = new ComputeResultRepository();
    const indicatorValueRepo = new IndicatorValueRepository();
    const indicatorMatrixRepo = new IndicatorMatrixRepository();

    computeService = new MeComputeService(
      registry,
      computeResultRepo,
      indicatorValueRepo,
      indicatorMatrixRepo,
    );
    await computeService.onModuleInit();
    testQueue = computeService.getQueue();
    try {
      const client = await testQueue.client;
      await client.ping();
      isRedisConnected = true;
    } catch {
      isRedisConnected = false;
      const memQueue = new InMemoryTestQueue();
      Object.assign(computeService, { computeQueue: memQueue });
      testQueue = memQueue as unknown as Queue;
    }
    slisQueryService = new SlisComputeQueryService();

    // 3. Seed minimal geography & scheme
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.gov.ng',
      fullName: 'System User',
      passwordHash: 'placeholder',
      isActive: true,
      phone: '+234000000000',
    });

    await testDb.insert(state).values({
      id: STATE_ID,
      code: 'KN',
      name: 'Kano',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(organisation).values({
      id: SCHEME_ID,
      type: 'scheme',
      code: 'KRIS',
      name: 'Kano River Irrigation Scheme',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 4. Seed farmers for query invariance test (20 approved farmers: 12 female, 8 male)
    const now = new Date().toISOString();
    const farmersToInsert = [];
    for (let i = 1; i <= 20; i++) {
      farmersToInsert.push({
        id: crypto.randomUUID(),
        schemeId: SCHEME_ID,
        stateId: STATE_ID,
        farmerCode: `FRM-${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        gender: i <= 12 ? 'female' : 'male',
        status: 'approved',
        approvedAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
    }
    await testDb.insert(farmer).values(farmersToInsert);
  });

  afterAll(async () => {
    if (isRedisConnected) {
      await computeService.onModuleDestroy();
      if (testQueue) {
        await testQueue.obliterate({ force: true }).catch(() => {});
        await testQueue.close().catch(() => {});
      }
    }
    await testClient.end();
    await adminClient.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
    );
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
    await adminClient.end();

    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
      setDatabaseUrl(ORIGINAL_DATABASE_URL);
    } else {
      delete process.env.DATABASE_URL;
      setDatabaseUrl(BASE_URL);
    }
    if (ORIGINAL_QUEUE_NAME) {
      process.env.ME_COMPUTE_QUEUE_NAME = ORIGINAL_QUEUE_NAME;
    } else {
      delete process.env.ME_COMPUTE_QUEUE_NAME;
    }
    if (ORIGINAL_DEBOUNCE_MS) {
      process.env.ME_COMPUTE_DEBOUNCE_MS = ORIGINAL_DEBOUNCE_MS;
    } else {
      delete process.env.ME_COMPUTE_DEBOUNCE_MS;
    }
  });

  describe('1. Debounce and Event Burst Collapsing', () => {
    it('collapses 500 rapid water_request events into exactly 1 scheme job and 1 global job', async () => {
      // Clean queue before test
      await testQueue.drain();

      // Fire 500 rapid domain events for the scheme
      for (let i = 0; i < 500; i++) {
        eventBus.emitRecompute({ schemeId: SCHEME_ID });
      }

      // Allow async event listener dispatch to complete
      for (let attempt = 0; attempt < 50; attempt++) {
        const delayed = await testQueue.getJobs(['delayed']);
        if (delayed.length === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Fetch all delayed jobs in the queue
      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.length).toBe(2);

      const jobIds = delayedJobs.map((j) => j.id).sort();
      expect(jobIds).toEqual(['debounce-global', `debounce-scheme-${SCHEME_ID}`].sort());

      // Verify the jobs have positive delays matching the configured window
      for (const job of delayedJobs) {
        expect(job.delay).toBe(60000);
      }
    });

    it('honors custom ME_COMPUTE_DEBOUNCE_MS from environment', async () => {
      process.env.ME_COMPUTE_DEBOUNCE_MS = '120000';
      const testSchemeId = crypto.randomUUID();

      await computeService.triggerRecompute(testSchemeId);

      const schemeJob = await testQueue.getJob(`debounce-scheme-${testSchemeId}`);
      expect(schemeJob).not.toBeNull();
      expect(schemeJob?.delay).toBe(120000);

      // Clean up test job
      await schemeJob?.remove();
      process.env.ME_COMPUTE_DEBOUNCE_MS = '60000';
    });

    it('does not duplicate or reset waiting jobs when additional events arrive', async () => {
      const testSchemeId = crypto.randomUUID();

      // First trigger
      await computeService.triggerRecompute(testSchemeId);
      const initialJob = await testQueue.getJob(`debounce-scheme-${testSchemeId}`);
      expect(initialJob).not.toBeNull();
      const initialTimestamp = initialJob!.timestamp;

      // Second trigger shortly after
      await new Promise((resolve) => setTimeout(resolve, 50));
      await computeService.triggerRecompute(testSchemeId);

      const jobAfterSecondTrigger = await testQueue.getJob(`debounce-scheme-${testSchemeId}`);
      expect(jobAfterSecondTrigger).not.toBeNull();
      // Timestamp and ID remain unchanged (no reset)
      expect(jobAfterSecondTrigger!.timestamp).toBe(initialTimestamp);

      // Clean up
      await jobAfterSecondTrigger?.remove();
    });
  });

  describe('2. Query Optimization Invariance (Old count(distinct id) vs New count(*))', () => {
    it('produces byte-for-byte identical results for scheme scope', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      // 1. New implementation from SlisComputeQueryService
      const newResult = await slisQueryService.getBeneficiaries(today, {
        scopeType: 'scheme',
        scopeOrgId: SCHEME_ID,
      });

      // 2. Old formula query with count(distinct id)
      const periodEndEod = `${today}T23:59:59.999Z`;
      const [oldRow] = await testDb
        .select({
          total: sql<number>`count(distinct ${farmer.id})::int`,
          female: sql<number>`count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::int`,
          male: sql<number>`count(distinct case when ${farmer.gender} = 'male' then ${farmer.id} end)::int`,
          femalePct: sql<
            string | null
          >`case when count(distinct ${farmer.id}) > 0 then round((count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::numeric / count(distinct ${farmer.id})::numeric) * 100, 2)::text else null end`,
        })
        .from(farmer)
        .where(
          sql`"status" = 'approved' AND "deleted_at" IS NULL AND "approved_at" <= ${periodEndEod}::timestamptz AND "scheme_id" = ${SCHEME_ID}::uuid`,
        );

      expect(newResult.total).toBe(String(oldRow?.total));
      expect(newResult.female).toBe(String(oldRow?.female));
      expect(newResult.male).toBe(String(oldRow?.male));
      expect(newResult.femalePct).toBe(oldRow?.femalePct);

      // Expected exact values
      expect(newResult.total).toBe('20');
      expect(newResult.female).toBe('12');
      expect(newResult.male).toBe('8');
      expect(newResult.femalePct).toBe('60.00');
    });

    it('produces byte-for-byte identical results for state scope', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      const newResult = await slisQueryService.getBeneficiaries(today, {
        scopeType: 'state',
        scopeStateId: STATE_ID,
      });

      const periodEndEod = `${today}T23:59:59.999Z`;
      const [oldRow] = await testDb
        .select({
          total: sql<number>`count(distinct ${farmer.id})::int`,
          female: sql<number>`count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::int`,
          male: sql<number>`count(distinct case when ${farmer.gender} = 'male' then ${farmer.id} end)::int`,
          femalePct: sql<
            string | null
          >`case when count(distinct ${farmer.id}) > 0 then round((count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::numeric / count(distinct ${farmer.id})::numeric) * 100, 2)::text else null end`,
        })
        .from(farmer)
        .where(
          sql`"status" = 'approved' AND "deleted_at" IS NULL AND "approved_at" <= ${periodEndEod}::timestamptz AND "state_id" = ${STATE_ID}::uuid`,
        );

      expect(newResult.total).toBe(String(oldRow?.total));
      expect(newResult.female).toBe(String(oldRow?.female));
      expect(newResult.male).toBe(String(oldRow?.male));
      expect(newResult.femalePct).toBe(oldRow?.femalePct);
      expect(newResult.total).toBe('20');
    });

    it('produces byte-for-byte identical results for national scope', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      const newResult = await slisQueryService.getBeneficiaries(today, {
        scopeType: 'national',
      });

      const periodEndEod = `${today}T23:59:59.999Z`;
      const [oldRow] = await testDb
        .select({
          total: sql<number>`count(distinct ${farmer.id})::int`,
          female: sql<number>`count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::int`,
          male: sql<number>`count(distinct case when ${farmer.gender} = 'male' then ${farmer.id} end)::int`,
          femalePct: sql<
            string | null
          >`case when count(distinct ${farmer.id}) > 0 then round((count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::numeric / count(distinct ${farmer.id})::numeric) * 100, 2)::text else null end`,
        })
        .from(farmer)
        .where(
          sql`"status" = 'approved' AND "deleted_at" IS NULL AND "approved_at" <= ${periodEndEod}::timestamptz`,
        );

      expect(newResult.total).toBe(String(oldRow?.total));
      expect(newResult.female).toBe(String(oldRow?.female));
      expect(newResult.male).toBe(String(oldRow?.male));
      expect(newResult.femalePct).toBe(oldRow?.femalePct);
      expect(newResult.total).toBe('20');
    });
  });
});
