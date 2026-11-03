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
    mockStore.getPendingOps = vi.fn().mockResolvedValue([
      {
        opId: 'op-1',
        entity: 'farmer',
        action: 'create',
        recordId: 'rec-1',
        baseVersion: 1,
        data: { name: 'Aliyu' },
        createdAt: '2026-11-03T12:00:00Z',
        attempts: 0,
      },
    ]);

    mockClient.post = vi.fn().mockResolvedValue({
      results: [
        {
          opId: 'op-1',
          entity: 'farmer',
          recordId: 'rec-1',
          outcome: 'applied',
          newVersion: 2,
        },
      ],
      serverTime: '2026-11-03T12:00:01Z',
    });

    const res = await engine.push();
    expect(res).toBeDefined();
    expect(mockStore.markRecordClean).toHaveBeenCalledWith('farmer', 'rec-1', 2);
    expect(mockStore.removeOutboxOp).toHaveBeenCalledWith('op-1');
    expect(engine.getState()).toBe('idle');
  });

  it('pulls server changes and updates safe cursor', async () => {
    mockStore.getCursor = vi.fn().mockResolvedValue('50:12');
    mockClient.get = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: '52:18',
      hasMore: false,
    });

    const res = await engine.pull('national');
    expect(res.nextCursor).toBe('52:18');
    expect(mockClient.get).toHaveBeenCalledWith('/slis/sync/pull?cursor=50%3A12');
    expect(mockStore.setCursor).toHaveBeenCalledWith('52:18', 'national');
  });
});
