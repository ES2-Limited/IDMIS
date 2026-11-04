import type { SyncPushInput, SyncPushResponse, SyncPullResponse } from '@idmis/contracts';
import { ApiClient } from '@idmis/api-client';
import { LocalStore } from './store';

export interface SyncEngineOptions {
  apiClient: ApiClient;
  store: LocalStore;
  deviceId?: string;
}

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'error' | 'locked';

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
   * Validates device offline grant before running push/pull.
   * If grant has expired, transitions engine into locked state.
   */
  public async checkOfflineAllowance(): Promise<boolean> {
    const grant = await this.store.getOfflineGrant();
    if (!grant) return true; // No expiration constraint set
    const expiry = new Date(grant).getTime();
    const isExpired = Date.now() > expiry;
    if (isExpired) {
      this.setState('locked');
      return false;
    }
    return true;
  }

  /**
   * Pushes all pending outbox operations to the server.
   * Retries preserve the exact same opId for idempotency.
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
          data: op.payload,
        })),
      };

      const response = await this.apiClient.post<SyncPushResponse>('/slis/sync/push', payload);

      for (const res of response.results) {
        if (res.outcome === 'applied') {
          await this.store.markRecordClean(res.entity, res.recordId, res.newVersion);
          await this.store.removeOutboxOp(res.opId);
        } else if (res.outcome === 'conflict') {
          // Mark conflict on device; keep outbox op until resolution
          await this.store.markRecordConflict(res.entity, res.recordId);
          await this.store.incrementOpAttempt(res.opId, 'Conflict detected with server state');
        } else if (res.outcome === 'rejected' || res.outcome === 'quarantined') {
          // Return to 'needs fixing' / rejected status
          const firstErr = res.errors?.[0]?.detail ?? res.quarantineReason ?? 'Validation rejected';
          await this.store.markRecordRejected(res.entity, res.recordId, firstErr);
          await this.store.incrementOpAttempt(res.opId, firstErr);
        }
      }

      this.setState('idle');
      return response;
    } catch (err) {
      this.setState('error');
      // Increment attempt count on all ops
      for (const op of ops) {
        await this.store.incrementOpAttempt(op.opId, String(err));
      }
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
          const existing = await this.store.getRecord(item.entity, item.recordId);
          if (existing && existing.status !== 'dirty') {
            await this.store.commitDelete(item.entity, item.recordId);
          }
        } else if (item.data) {
          const existing = await this.store.getRecord(item.entity, item.recordId);
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
    const allowed = await this.checkOfflineAllowance();
    if (!allowed) {
      throw new Error('Offline allowance has expired. Please connect to internet to refresh.');
    }
    await this.push();
    await this.pull(scopeKey);
  }
}
