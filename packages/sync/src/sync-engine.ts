import type { SyncPushInput, SyncPushResponse, SyncPullResponse } from '@idmis/contracts';
import { ApiClient } from '@idmis/api-client';
import { LocalStore } from './store';

export interface SyncEngineOptions {
  apiClient: ApiClient;
  store: LocalStore;
  deviceId?: string;
}

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'error';

export class SyncEngine {
  private readonly apiClient: ApiClient;
  private readonly store: LocalStore;
  private readonly deviceId: string;
  private state: SyncState = 'idle';
  private listeners = new Set<(state: SyncState) => void>();

  constructor(options: SyncEngineOptions) {
    this.apiClient = options.apiClient;
    this.store = options.store;
    this.deviceId = options.deviceId ?? 'device-browser-pwa';
  }

  public getState(): SyncState {
    return this.state;
  }

  public subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach((cb) => cb(newState));
  }

  /**
   * Pushes all pending outbox operations to the server.
   */
  public async push(): Promise<SyncPushResponse | null> {
    const ops = await this.store.getPendingOps();
    if (ops.length === 0) {
      return null;
    }

    this.setState('pushing');

    try {
      const payload: SyncPushInput = {
        deviceId: this.deviceId,
        ops: ops.map((op) => ({
          opId: op.opId,
          entity: op.entity,
          action: op.action,
          recordId: op.recordId,
          baseVersion: op.baseVersion,
          data: op.data,
        })),
      };

      const response = await this.apiClient.post<SyncPushResponse>('/slis/sync/push', payload);

      for (const res of response.results) {
        if (res.outcome === 'applied') {
          await this.store.markRecordClean(res.entity, res.recordId, res.newVersion);
          await this.store.removeOutboxOp(res.opId);
        } else if (res.outcome === 'conflict') {
          await this.store.markRecordConflict(res.entity, res.recordId);
          // Keep op or retain for resolution
        }
      }

      this.setState('idle');
      return response;
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  /**
   * Pulls incremental server changes using the safe watermark cursor (${xid}:${seq}).
   */
  public async pull(scopeKey = 'national'): Promise<SyncPullResponse> {
    this.setState('pulling');

    try {
      const cursor = await this.store.getCursor(scopeKey);
      const queryParams = new URLSearchParams();
      if (cursor) queryParams.set('cursor', cursor);

      const endpoint = `/slis/sync/pull${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.apiClient.get<SyncPullResponse>(endpoint);

      // Apply changes to local store
      for (const item of response.items) {
        if (item.op === 'delete' || item.deleted) {
          // Remove local record
          const existing = await this.store.getRecord(item.entity, item.recordId);
          if (existing && existing.status !== 'dirty') {
            await this.store.commitDelete(item.entity, item.recordId);
          }
        } else if (item.data) {
          const existing = await this.store.getRecord(item.entity, item.recordId);
          // If not dirty locally, upsert clean server state
          if (!existing || existing.status === 'clean') {
            await this.store.commitInsert(item.entity, item.recordId, item.data, {
              schemeId: item.schemeId,
              stateId: item.stateId,
            });
            await this.store.markRecordClean(item.entity, item.recordId, item.seq);
          }
        }
      }

      if (response.nextCursor) {
        await this.store.setCursor(response.nextCursor, scopeKey);
      }

      this.setState('idle');
      return response;
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  /**
   * Performs full synchronization cycle (push first, then pull).
   */
  public async sync(scopeKey = 'national'): Promise<void> {
    await this.push();
    await this.pull(scopeKey);
  }
}
