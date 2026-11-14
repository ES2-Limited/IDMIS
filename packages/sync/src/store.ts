import {
  IdmisDatabase,
  type LocalRecord,
  type OutboxOp,
  type ReferenceDataRecord,
  type PhotoQueueItem,
} from './db';
import { generateUuidV7 } from './uuid';

export class LocalStore {
  constructor(private readonly db: IdmisDatabase) {}

  public async getRecord(entity: string, recordId: string): Promise<LocalRecord | undefined> {
    const key = `${entity}:${recordId}`;
    return this.db.records.get(key);
  }

  public async listRecords(
    entity: string,
    filters?: { schemeId?: string | null; stateId?: string | null },
  ): Promise<LocalRecord[]> {
    let collection = this.db.records.where('entity').equals(entity);

    if (filters?.schemeId) {
      collection = collection.filter((r) => r.schemeId === filters.schemeId);
    }

    return collection.toArray();
  }

  /**
   * Commits a local insert mutation and queues an outbox op atomically.
   */
  public async commitInsert(
    entity: string,
    recordId: string,
    payload: Record<string, unknown>,
    options?: { schemeId?: string | null; stateId?: string | null },
  ): Promise<{ record: LocalRecord; op: OutboxOp }> {
    const opId = generateUuidV7();
    const now = new Date().toISOString();

    const record: LocalRecord = {
      id: `${entity}:${recordId}`,
      entity,
      recordId,
      schemeId: options?.schemeId,
      stateId: options?.stateId,
      data: payload,
      version: 1,
      status: 'dirty',
      updatedAt: now,
    };

    const op: OutboxOp = {
      opId,
      entity,
      action: 'create',
      recordId,
      baseVersion: 1,
      payload,
      createdAt: now,
      attempts: 0,
    };

    await this.db.transaction('rw', [this.db.records, this.db.outbox], async () => {
      await this.db.records.put(record);
      await this.db.outbox.put(op);
    });

    return { record, op };
  }

  /**
   * Directly stores or updates a locally cached record marked as 'clean' (already synced online).
   * Does NOT queue any outbox operation.
   */
  public async cacheCleanRecord(
    entity: string,
    recordId: string,
    payload: Record<string, unknown>,
    options?: { schemeId?: string | null; stateId?: string | null; version?: number },
  ): Promise<LocalRecord> {
    const now = new Date().toISOString();
    const record: LocalRecord = {
      id: `${entity}:${recordId}`,
      entity,
      recordId,
      schemeId: options?.schemeId,
      stateId: options?.stateId,
      data: payload,
      version: options?.version ?? 1,
      status: 'clean',
      updatedAt: now,
    };

    await this.db.records.put(record);
    return record;
  }

  /**
   * Commits a local update mutation and queues an outbox op atomically.
   */
  public async commitUpdate(
    entity: string,
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<{ record: LocalRecord; op: OutboxOp }> {
    const existing = await this.getRecord(entity, recordId);
    if (!existing) {
      throw new Error(`Record ${entity}:${recordId} not found locally.`);
    }

    const opId = generateUuidV7();
    const now = new Date().toISOString();
    const nextVersion = existing.version + 1;

    const record: LocalRecord = {
      ...existing,
      data: { ...existing.data, ...payload },
      version: nextVersion,
      status: 'dirty',
      updatedAt: now,
    };

    const op: OutboxOp = {
      opId,
      entity,
      action: 'update',
      recordId,
      baseVersion: existing.version,
      payload,
      createdAt: now,
      attempts: 0,
    };

    await this.db.transaction('rw', [this.db.records, this.db.outbox], async () => {
      await this.db.records.put(record);
      await this.db.outbox.put(op);
    });

    return { record, op };
  }

  /**
   * Commits a local delete mutation and queues an outbox op atomically.
   */
  public async commitDelete(entity: string, recordId: string): Promise<OutboxOp> {
    const existing = await this.getRecord(entity, recordId);
    const baseVersion = existing ? existing.version : 1;
    const opId = generateUuidV7();
    const now = new Date().toISOString();

    const op: OutboxOp = {
      opId,
      entity,
      action: 'delete',
      recordId,
      baseVersion,
      payload: {},
      createdAt: now,
      attempts: 0,
    };

    await this.db.transaction('rw', [this.db.records, this.db.outbox], async () => {
      await this.db.records.delete(`${entity}:${recordId}`);
      await this.db.outbox.put(op);
    });

    return op;
  }

  public async getPendingOps(): Promise<OutboxOp[]> {
    return this.db.outbox.orderBy('createdAt').toArray();
  }

  public async removeOutboxOp(opId: string): Promise<void> {
    await this.db.outbox.delete(opId);
  }

  public async incrementOpAttempt(opId: string, error?: string): Promise<void> {
    const op = await this.db.outbox.get(opId);
    if (op) {
      await this.db.outbox.update(opId, {
        attempts: op.attempts + 1,
        lastError: error ?? null,
      });
    }
  }

  public async markRecordClean(entity: string, recordId: string, version?: number): Promise<void> {
    const key = `${entity}:${recordId}`;
    const existing = await this.db.records.get(key);
    if (existing) {
      await this.db.records.update(key, {
        status: 'clean',
        version: version ?? existing.version,
        rejectionReason: null,
      });
    }
  }

  public async markRecordConflict(entity: string, recordId: string): Promise<void> {
    const key = `${entity}:${recordId}`;
    await this.db.records.update(key, {
      status: 'conflict',
    });
  }

  public async markRecordRejected(
    entity: string,
    recordId: string,
    reason?: string,
  ): Promise<void> {
    const key = `${entity}:${recordId}`;
    await this.db.records.update(key, {
      status: 'rejected',
      rejectionReason: reason ?? 'Server validation rejected record',
    });
  }

  // Reference Data Cache
  public async cacheReferenceData(
    type: ReferenceDataRecord['type'],
    items: Array<{ recordId: string; data: Record<string, unknown> }>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const rows: ReferenceDataRecord[] = items.map((item) => ({
      id: `${type}:${item.recordId}`,
      type,
      recordId: item.recordId,
      data: item.data,
      updatedAt: now,
    }));
    await this.db.referenceData.bulkPut(rows);
  }

  public async getReferenceData(type: ReferenceDataRecord['type']): Promise<ReferenceDataRecord[]> {
    return this.db.referenceData.where('type').equals(type).toArray();
  }

  // Photo Queue Management
  public async queuePhoto(
    item: Omit<PhotoQueueItem, 'id' | 'createdAt' | 'attempts' | 'status' | 'uploadedBytes'>,
  ): Promise<PhotoQueueItem> {
    const id = generateUuidV7();
    const photo: PhotoQueueItem = {
      ...item,
      id,
      status: 'pending',
      uploadedBytes: 0,
      createdAt: new Date().toISOString(),
    };
    await this.db.photoQueue.put(photo);
    return photo;
  }

  public async getPendingPhotos(): Promise<PhotoQueueItem[]> {
    return this.db.photoQueue.where('status').equals('pending').toArray();
  }

  public async updatePhotoProgress(
    id: string,
    status: PhotoQueueItem['status'],
    uploadedBytes: number,
    error?: string,
  ): Promise<void> {
    await this.db.photoQueue.update(id, {
      status,
      uploadedBytes,
      error: error ?? null,
    });
  }

  // Watermark Cursors
  public async getCursor(scopeKey = 'national'): Promise<string | undefined> {
    const record = await this.db.cursors.get(scopeKey);
    return record?.cursor;
  }

  public async setCursor(cursor: string, scopeKey = 'national'): Promise<void> {
    await this.db.cursors.put({
      scopeKey,
      cursor,
      updatedAt: new Date().toISOString(),
    });
  }

  // Offline Allowance Management
  public async setOfflineGrant(grantUntil: string): Promise<void> {
    await this.db.meta.put({
      key: 'offline_grant_until',
      value: grantUntil,
      updatedAt: new Date().toISOString(),
    });
  }

  public async getOfflineGrant(): Promise<string | null> {
    const item = await this.db.meta.get('offline_grant_until');
    return item ? (item.value as string) : null;
  }
}
