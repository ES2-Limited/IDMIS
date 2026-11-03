import { IdmisDatabase, type LocalRecord, type OutboxOp } from './db';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
    data: Record<string, unknown>,
    options?: { schemeId?: string | null; stateId?: string | null },
  ): Promise<{ record: LocalRecord; op: OutboxOp }> {
    const opId = generateUuid();
    const now = new Date().toISOString();

    const record: LocalRecord = {
      id: `${entity}:${recordId}`,
      entity,
      recordId,
      schemeId: options?.schemeId,
      stateId: options?.stateId,
      data,
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
      data,
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
   * Commits a local update mutation and queues an outbox op atomically.
   */
  public async commitUpdate(
    entity: string,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<{ record: LocalRecord; op: OutboxOp }> {
    const existing = await this.getRecord(entity, recordId);
    if (!existing) {
      throw new Error(`Cannot update non-existent record ${entity}:${recordId}`);
    }

    const opId = generateUuid();
    const now = new Date().toISOString();

    const updatedRecord: LocalRecord = {
      ...existing,
      data: { ...existing.data, ...data },
      version: existing.version + 1,
      status: 'dirty',
      updatedAt: now,
    };

    const op: OutboxOp = {
      opId,
      entity,
      action: 'update',
      recordId,
      baseVersion: existing.version,
      data,
      createdAt: now,
      attempts: 0,
    };

    await this.db.transaction('rw', [this.db.records, this.db.outbox], async () => {
      await this.db.records.put(updatedRecord);
      await this.db.outbox.put(op);
    });

    return { record: updatedRecord, op };
  }

  /**
   * Commits a local delete mutation and queues an outbox op atomically.
   */
  public async commitDelete(entity: string, recordId: string): Promise<OutboxOp> {
    const existing = await this.getRecord(entity, recordId);
    const opId = generateUuid();
    const now = new Date().toISOString();

    const op: OutboxOp = {
      opId,
      entity,
      action: 'delete',
      recordId,
      baseVersion: existing ? existing.version : 1,
      data: {},
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

  public async markRecordClean(
    entity: string,
    recordId: string,
    newVersion?: number,
  ): Promise<void> {
    const key = `${entity}:${recordId}`;
    const record = await this.db.records.get(key);
    if (record) {
      await this.db.records.update(key, {
        status: 'clean',
        version: newVersion ?? record.version,
      });
    }
  }

  public async markRecordConflict(entity: string, recordId: string): Promise<void> {
    const key = `${entity}:${recordId}`;
    const record = await this.db.records.get(key);
    if (record) {
      await this.db.records.update(key, { status: 'conflict' });
    }
  }

  public async getCursor(scopeKey = 'national'): Promise<string | undefined> {
    const entry = await this.db.cursors.get(scopeKey);
    return entry?.cursor;
  }

  public async setCursor(cursor: string, scopeKey = 'national'): Promise<void> {
    await this.db.cursors.put({
      scopeKey,
      cursor,
      updatedAt: new Date().toISOString(),
    });
  }
}
