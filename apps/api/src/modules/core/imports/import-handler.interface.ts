import type { ImportColumnDefinition, RequestScope } from '@idmis/contracts';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';
import type { importBatch } from '@idmis/db';

export type ImportBatchEntity = typeof importBatch.$inferSelect;

export interface ImportRowData<TParsed = Record<string, unknown>> {
  id: string;
  batchId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  parsedData: TParsed;
  naturalKey?: string | null;
  targetEntityId?: string | null;
  beforeImage?: Record<string, unknown> | null;
}

export interface ParseRowResult<TParsed = Record<string, unknown>> {
  rawData: Record<string, unknown>;
  parsedData: TParsed;
  errors?: Array<{ column: string; message: string; code?: string }>;
}

export interface CommitRowResult {
  targetEntityId: string;
  beforeImage: Record<string, unknown> | null;
}

export interface UndoRowResult {
  skipped?: boolean;
  reason?: string;
}

export interface ImportDatasetHandler<TParsed = Record<string, unknown>> {
  readonly dataset: string;
  readonly version: number;
  readonly permission: string;
  readonly columns: ImportColumnDefinition[];
  getExampleRow?(): Record<string, unknown>;

  parseRow(
    rawRow: Record<string, unknown>,
    ctx: { batch: ImportBatchEntity; authz?: UserAuthz },
  ): Promise<ParseRowResult<TParsed>>;

  validateRow(
    row: { rowNumber: number; rawData: Record<string, unknown>; parsedData: TParsed },
    scope: RequestScope,
    tx: TransactionClient,
  ): Promise<Array<{ column: string; message: string; code?: string }>>;

  naturalKey(parsedData: TParsed, rawData: Record<string, unknown>): string;

  commitRow(
    row: {
      id: string;
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: TParsed;
      batchId: string;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<CommitRowResult>;

  undoRow(
    row: {
      id: string;
      rowNumber: number;
      targetEntityId: string;
      beforeImage: Record<string, unknown> | null;
      parsedData?: unknown;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult>;
}
