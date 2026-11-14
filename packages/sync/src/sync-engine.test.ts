import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine } from './sync-engine';
import { LocalStore } from './store';
import { ApiClient } from '@idmis/api-client';

describe('SyncEngine (FE-1.4)', () => {
  let mockStore: Partial<LocalStore>;
  let mockClient: Partial<ApiClient>;
  let engine: SyncEngine;

  beforeEach(() => {
    mockStore = {
      getPendingOps: vi.fn().mockResolvedValue([]),
      markRecordClean: vi.fn().mockResolvedValue(undefined),
      removeOutboxOp: vi.fn().mockResolvedValue(undefined),
      getCursor: vi.fn().mockResolvedValue(undefined),
      setCursor: vi.fn().mockResolvedValue(undefined),
      cacheCleanRecord: vi.fn().mockResolvedValue({} as any),
      deleteLocalRecord: vi.fn().mockResolvedValue(undefined),
      getRecord: vi.fn().mockResolvedValue(null),
    };

    mockClient = {
      post: vi.fn().mockResolvedValue({
        results: [],
        serverTime: new Date().toISOString(),
      }),
      get: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: '100:1',
        hasMore: false,
      }),
    };

    engine = new SyncEngine({
      apiClient: mockClient as ApiClient,
      store: mockStore as LocalStore,
      deviceId: 'test-device-uuid',
    });
  });

  it('starts in idle state', () => {
    expect(engine.getState()).toBe('idle');
  });

  it('skips push when there are no pending ops', async () => {
    const res = await engine.push();
    expect(res).toBeNull();
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(engine.getState()).toBe('idle');
  });

  it('pushes pending ops and marks clean on applied outcome', async () => {
    const opId = '018f3a5e-0000-7000-8000-000000000001';
    const recordId = '018f3a5e-0000-7000-8000-000000000002';
    mockStore.getPendingOps = vi.fn().mockResolvedValue([
      {
        opId,
        entity: 'farmer',
        action: 'create',
        recordId,
        baseVersion: 1,
        data: { name: 'Aliyu' },
        createdAt: '2026-11-03T12:00:00Z',
        attempts: 0,
      },
    ]);

    mockClient.post = vi.fn().mockResolvedValue({
      results: [
        {
          opId,
          entity: 'farmer',
          recordId,
          outcome: 'applied',
          newVersion: 2,
        },
      ],
      serverTime: '2026-11-03T12:00:01Z',
    });

    const res = await engine.push();
    expect(res).toBeDefined();
    expect(mockStore.markRecordClean).toHaveBeenCalledWith('farmer', recordId, 2);
    expect(mockStore.removeOutboxOp).toHaveBeenCalledWith(opId);
    expect(engine.getState()).toBe('idle');
  });

  it('purges legacy invalid ops with non-UUID identifiers', async () => {
    mockStore.getPendingOps = vi.fn().mockResolvedValue([
      {
        opId: 'legacy-op-not-uuid',
        entity: 'farmer',
        action: 'create',
        recordId: 'legacy-rec-not-uuid',
        baseVersion: 1,
        data: { name: 'Test' },
        createdAt: '2026-11-03T12:00:00Z',
        attempts: 0,
      },
    ]);

    const res = await engine.push();
    expect(res).toBeNull();
    expect(mockStore.removeOutboxOp).toHaveBeenCalledWith('legacy-op-not-uuid');
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(engine.getState()).toBe('idle');
  });

  it('pulls server changes and updates safe cursor', async () => {
    mockStore.getCursor = vi.fn().mockResolvedValue('50:12');
    mockClient.get = vi.fn().mockResolvedValue({
      items: [
        {
          entity: 'farmer',
          recordId: '018f3a5e-0000-7000-8000-000000000099',
          seq: 51,
          data: { name: 'Musa' },
        },
      ],
      nextCursor: '52:18',
      hasMore: false,
    });

    const res = await engine.pull('national');
    expect(res.nextCursor).toBe('52:18');
    expect(mockStore.setCursor).toHaveBeenCalledWith('52:18', 'national');
    expect(mockStore.cacheCleanRecord).toHaveBeenCalledWith(
      'farmer',
      '018f3a5e-0000-7000-8000-000000000099',
      { name: 'Musa' },
      expect.objectContaining({ version: 51 }),
    );
    expect(mockClient.get).toHaveBeenCalledWith('/slis/sync/pull?cursor=50%3A12');
    expect(engine.getState()).toBe('idle');
  });
});
