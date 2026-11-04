import Dexie, { type Table } from 'dexie';

export interface LocalRecord {
  id: string; // `${entity}:${recordId}`
  entity: string;
  recordId: string;
  schemeId?: string | null;
  stateId?: string | null;
  data: Record<string, unknown>;
  version: number;
  status: 'clean' | 'dirty' | 'conflict' | 'rejected';
  rejectionReason?: string | null;
  updatedAt: string;
}

export interface OutboxOp {
  opId: string; // UUID v7
  entity: string;
  action: 'create' | 'update' | 'delete';
  recordId: string;
  baseVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
}

export interface WatermarkCursor {
  scopeKey: string; // 'national' or schemeId
  cursor: string; // `${xid}:${seq}`
  updatedAt: string;
}

export interface ReferenceDataRecord {
  id: string; // `${type}:${recordId}`
  type: 'scheme' | 'wua' | 'sector' | 'lookup' | 'ward';
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface PhotoQueueItem {
  id: string; // UUID v7
  recordId: string;
  entity: string;
  category: 'farmer_portrait' | 'id_document' | 'plot_boundary' | 'receipt';
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadedBytes: number;
  createdAt: string;
  error?: string | null;
}

export interface OfflineMeta {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
  updatedAt: string;
}

export class IdmisDatabase extends Dexie {
  records!: Table<LocalRecord, string>;
  outbox!: Table<OutboxOp, string>;
  cursors!: Table<WatermarkCursor, string>;
  referenceData!: Table<ReferenceDataRecord, string>;
  photoQueue!: Table<PhotoQueueItem, string>;
  meta!: Table<OfflineMeta, string>;

  constructor(dbName = 'idmis_offline_db') {
    super(dbName);

    this.version(2).stores({
      records: 'id, entity, recordId, schemeId, stateId, status, updatedAt',
      outbox: 'opId, entity, recordId, createdAt, attempts',
      cursors: 'scopeKey',
      referenceData: 'id, type, recordId, updatedAt',
      photoQueue: 'id, recordId, entity, status, createdAt',
      meta: 'key',
    });
  }
}

export const localDb = new IdmisDatabase();
