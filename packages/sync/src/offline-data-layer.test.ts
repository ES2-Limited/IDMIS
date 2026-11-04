import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdmisDatabase } from './db';
import { LocalStore } from './store';
import { SyncEngine } from './sync-engine';
import { generateUuidV7 } from './uuid';
import type { ApiClient } from '@idmis/api-client';

describe('Offline Data Layer & Sync Engine (FE-2.2)', () => {
  let db: IdmisDatabase;
  let store: LocalStore;
  let mockApiClient: ApiClient;

  beforeEach(() => {
    // Unique in-memory database name per test
    const dbName = `test_idmis_${Math.random().toString(36).substring(7)}`;
    db = new IdmisDatabase(dbName);
    store = new LocalStore(db);

    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
  });

  describe('UUIDv7 Generator', () => {
    it('generates valid RFC 9562 UUIDv7 with correct version and variant', () => {
      const id1 = generateUuidV7();
      const id2 = generateUuidV7();

      // Standard UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id1).toMatch(uuidRegex);
      expect(id2).toMatch(uuidRegex);

      // Monotonically time ordered
      expect(id2 >= id1).toBe(true);
    });
  });

  describe('Atomic Commit and Outbox Operations', () => {
    it('creates local record and queues outbox op with identical data atomically', async () => {
      const farmerId = generateUuidV7();
      const data = { fullName: 'Abubakar Lawal', phone: '+2348011223344' };

      const { record, op } = await store.commitInsert('farmer', farmerId, data, {
        schemeId: 'scheme-kris',
      });

      expect(record.id).toBe(`farmer:${farmerId}`);
      expect(record.status).toBe('dirty');
      expect(record.version).toBe(1);
      expect(op.recordId).toBe(farmerId);
      expect(op.payload).toEqual(data);

      // Verify outbox queue
      const pending = await store.getPendingOps();
      expect(pending).toHaveLength(1);
      expect(pending[0].opId).toBe(op.opId);
    });

    it('updates local record and increments version while queuing update op', async () => {
      const farmerId = generateUuidV7();
      await store.commitInsert('farmer', farmerId, { name: 'Initial' });

      const { record: updatedRecord, op: updateOp } = await store.commitUpdate('farmer', farmerId, {
        name: 'Updated Name',
      });

      expect(updatedRecord.version).toBe(2);
      expect(updatedRecord.data.name).toBe('Updated Name');
      expect(updateOp.action).toBe('update');
      expect(updateOp.baseVersion).toBe(1);

      const pending = await store.getPendingOps();
      expect(pending).toHaveLength(2);
    });
  });

  describe('Sync Push Outcomes & Idempotency', () => {
    it('retry sends the exact same opId on failure without generating a new ID', async () => {
      const farmerId = generateUuidV7();
      const { op } = await store.commitInsert('farmer', farmerId, { name: 'Farmer A' });

      let capturedPayload: unknown = null;
      vi.mocked(mockApiClient.post).mockImplementation(async (_url: string, body: unknown) => {
        capturedPayload = body;
        throw new Error('Network timeout');
      });

      const engine = new SyncEngine({ apiClient: mockApiClient, store });

      // First attempt fails
      await expect(engine.push()).rejects.toThrow('Network timeout');
      const firstPayload = capturedPayload as { ops: Array<{ opId: string }> };
      expect(firstPayload.ops[0].opId).toBe(op.opId);

      // Second retry attempt sends the exact same opId
      let retryPayload: unknown = null;
      vi.mocked(mockApiClient.post).mockImplementation(async (_url: string, body: unknown) => {
        retryPayload = body;
        return {
          results: [
            {
              opId: op.opId,
              entity: 'farmer',
              recordId: farmerId,
              outcome: 'applied',
              newVersion: 1,
            },
          ],
          serverTime: new Date().toISOString(),
        } as unknown as never;
      });

      await engine.push();
      const retryBody = retryPayload as { ops: Array<{ opId: string }> };
      expect(retryBody.ops[0].opId).toBe(op.opId);

      // Outbox must now be cleared
      const pendingAfter = await store.getPendingOps();
      expect(pendingAfter).toHaveLength(0);

      // Record must now be clean
      const saved = await store.getRecord('farmer', farmerId);
      expect(saved?.status).toBe('clean');
    });

    it('rejected op marks local record as rejected (Needs fixing) with reason', async () => {
      const farmerId = generateUuidV7();
      const { op } = await store.commitInsert('farmer', farmerId, { name: 'Invalid NIN' });

      vi.mocked(mockApiClient.post).mockResolvedValue({
        results: [
          {
            opId: op.opId,
            entity: 'farmer',
            recordId: farmerId,
            outcome: 'rejected',
            errors: [{ status: 400, detail: 'NIN must be 11 digits', field: 'nin' }],
          },
        ],
        serverTime: new Date().toISOString(),
      } as unknown as never);

      const engine = new SyncEngine({ apiClient: mockApiClient, store });
      await engine.push();

      const record = await store.getRecord('farmer', farmerId);
      expect(record?.status).toBe('rejected');
      expect(record?.rejectionReason).toContain('NIN must be 11 digits');
    });

    it('conflict outcome marks local record as conflict for user resolution', async () => {
      const farmerId = generateUuidV7();
      const { op } = await store.commitInsert('farmer', farmerId, { name: 'Stale Edit' });

      vi.mocked(mockApiClient.post).mockResolvedValue({
        results: [
          {
            opId: op.opId,
            entity: 'farmer',
            recordId: farmerId,
            outcome: 'conflict',
            conflictId: generateUuidV7(),
          },
        ],
        serverTime: new Date().toISOString(),
      } as unknown as never);

      const engine = new SyncEngine({ apiClient: mockApiClient, store });
      await engine.push();

      const record = await store.getRecord('farmer', farmerId);
      expect(record?.status).toBe('conflict');
    });

    it('closing or interrupting mid-sync loses no pending outbox mutations or data', async () => {
      const farmerId = generateUuidV7();
      const plotId = generateUuidV7();

      await store.commitInsert('farmer', farmerId, { name: 'Musa Garba' });
      await store.commitInsert('plot', plotId, { sizeHa: 2.5 });

      // Before sync: 2 pending operations
      const initialPending = await store.getPendingOps();
      expect(initialPending).toHaveLength(2);

      // Simulate crash or abort mid-push
      vi.mocked(mockApiClient.post).mockImplementation(async () => {
        throw new Error('Device powered off or connection abruptly dropped');
      });

      const engine = new SyncEngine({ apiClient: mockApiClient, store });
      await expect(engine.push()).rejects.toThrow('Device powered off');

      // After abort: both ops must strictly remain intact in outbox
      const afterCrashPending = await store.getPendingOps();
      expect(afterCrashPending).toHaveLength(2);
      expect(afterCrashPending.map((o) => o.recordId)).toEqual([farmerId, plotId]);

      // Both records still safely exist on device
      const farmerRec = await store.getRecord('farmer', farmerId);
      const plotRec = await store.getRecord('plot', plotId);
      expect(farmerRec?.status).toBe('dirty');
      expect(plotRec?.status).toBe('dirty');
    });
  });

  describe('Offline Allowance & Auto-Lock', () => {
    it('allows sync when offline grant is valid within 14 days', async () => {
      const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await store.setOfflineGrant(validUntil);

      const engine = new SyncEngine({ apiClient: mockApiClient, store });
      const allowed = await engine.checkOfflineAllowance();

      expect(allowed).toBe(true);
      expect(engine.getState()).toBe('idle');
    });

    it('locks engine when offline grant has expired and prevents sync', async () => {
      const expiredYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await store.setOfflineGrant(expiredYesterday);

      const engine = new SyncEngine({ apiClient: mockApiClient, store });
      const allowed = await engine.checkOfflineAllowance();

      expect(allowed).toBe(false);
      expect(engine.getState()).toBe('locked');
      await expect(engine.sync()).rejects.toThrow('Offline allowance has expired');
    });
  });
});
