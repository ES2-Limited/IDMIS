import Dexie, { type Table } from 'dexie';

export interface LocalRecord {
  id: string; // `${entity}:${recordId}`
  entity: string;
  recordId: string;
  schemeId?: string | null;
  stateId?: string | null;
  data: Record<string, unknown>;
  version: number;
  status: 'clean' | 'dirty' | 'conflict';
  updatedAt: string;
}

export interface OutboxOp {
  opId: string; // UUID v4
  entity: string;
  action: 'create' | 'update' | 'delete';
  recordId: string;
  baseVersion: number;
  data: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
}

export interface WatermarkCursor {
  scopeKey: string; // 'national' or schemeId
  cursor: string; // `${xid}:${seq}`
  updatedAt: string;
}

export class IdmisDatabase extends Dexie {
  records!: Table<LocalRecord, string>;
  outbox!: Table<OutboxOp, string>;
  cursors!: Table<WatermarkCursor, string>;

  constructor(dbName = 'idmis_offline_db') {
    super(dbName);

    this.version(1).stores({
      records: 'id, entity, recordId, schemeId, stateId, status, updatedAt',
      outbox: 'opId, entity, recordId, createdAt, attempts',
      cursors: 'scopeKey',
    });
  }
}

export const localDb = new IdmisDatabase();
