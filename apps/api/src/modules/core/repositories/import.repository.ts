import { and, desc, eq, inArray, or, type SQL } from '@idmis/db';
import { db, importBatch, importRow } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type {
  ImportBatchStatus,
  ImportRowStatus,
  ListImportBatchesQuery,
  RequestScope,
} from '@idmis/contracts';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateImportBatchData {
  id?: string;
  dataset: string;
  fileId: string;
  schemeId?: string | null;
  stateId?: string | null;
  createdBy: string;
}

export interface CreateImportRowData {
  id?: string;
  batchId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  parsedData?: Record<string, unknown> | null;
  status: ImportRowStatus;
  errors?: Array<{ column: string; message: string; code?: string }>;
  naturalKey?: string | null;
  targetEntityId?: string | null;
  beforeImage?: Record<string, unknown> | null;
}

@Injectable()
export class ImportRepository {
  async createBatch(data: CreateImportBatchData, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .insert(importBatch)
      .values({
        id: data.id,
        dataset: data.dataset,
        fileId: data.fileId,
        schemeId: data.schemeId,
        stateId: data.stateId,
        createdBy: data.createdBy,
        status: 'uploaded',
      })
      .returning();
    return row;
  }

  async getBatchById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(importBatch).where(eq(importBatch.id, id)).limit(1);
    return row ?? null;
  }

  async listBatches(
    scope: RequestScope,
    filters: Partial<ListImportBatchesQuery> & { page?: number } = {},
    txDb: DatabaseOrTx = db,
  ) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Scope enforcement: stateIds and schemeIds
    if (!scope.isNational) {
      const scopeConditions: SQL[] = [];
      if (scope.stateIds && scope.stateIds.length > 0) {
        scopeConditions.push(inArray(importBatch.stateId, scope.stateIds));
      }
      if (scope.schemeIds && scope.schemeIds.length > 0) {
        scopeConditions.push(inArray(importBatch.schemeId, scope.schemeIds));
      }
      if (scopeConditions.length > 0) {
        conditions.push(or(...scopeConditions)!);
      } else {
        return { items: [], page, limit, total: 0 };
      }
    }

    if (filters.dataset) {
      conditions.push(eq(importBatch.dataset, filters.dataset));
    }
    if (filters.status) {
      conditions.push(eq(importBatch.status, filters.status));
    }
    if (filters.stateId) {
      conditions.push(eq(importBatch.stateId, filters.stateId));
    }
    if (filters.schemeId) {
      conditions.push(eq(importBatch.schemeId, filters.schemeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await txDb
      .select()
      .from(importBatch)
      .where(whereClause)
      .orderBy(desc(importBatch.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows,
      page,
      limit,
    };
  }

  async updateBatch(
    id: string,
    patch: {
      status?: ImportBatchStatus;
      totalRows?: number;
      validRows?: number;
      errorRows?: number;
      committedRows?: number;
      errorMessage?: string | null;
      committedAt?: string | null;
      undoneAt?: string | null;
    },
    expectedVersion?: number,
    txDb: DatabaseOrTx = db,
  ) {
    const conditions: SQL[] = [eq(importBatch.id, id)];
    if (expectedVersion !== undefined) {
      conditions.push(eq(importBatch.version, expectedVersion));
    }

    const [updated] = await txDb
      .update(importBatch)
      .set({
        ...patch,
        updatedAt: new Date().toISOString(),
      })
      .where(and(...conditions))
      .returning();

    if (!updated && expectedVersion !== undefined) {
      const existing = await txDb.select().from(importBatch).where(eq(importBatch.id, id)).limit(1);
      throw new ConflictProblemException({
        detail: 'Import batch was updated by another process (version conflict)',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }
    return updated ?? null;
  }

  async createRows(rows: CreateImportRowData[], txDb: DatabaseOrTx = db) {
    if (rows.length === 0) return [];
    return txDb.insert(importRow).values(rows).returning();
  }

  async listRows(
    batchId: string,
    filters: { page?: number; limit?: number; status?: ImportRowStatus } = {},
    txDb: DatabaseOrTx = db,
  ) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(importRow.batchId, batchId)];
    if (filters.status) {
      conditions.push(eq(importRow.status, filters.status));
    }

    const rows = await txDb
      .select()
      .from(importRow)
      .where(and(...conditions))
      .orderBy(importRow.rowNumber)
      .limit(limit)
      .offset(offset);

    return rows;
  }

  async getRowsByBatch(batchId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select()
      .from(importRow)
      .where(eq(importRow.batchId, batchId))
      .orderBy(importRow.rowNumber);
  }

  async updateRow(
    id: string,
    patch: {
      status?: ImportRowStatus;
      targetEntityId?: string | null;
      beforeImage?: Record<string, unknown> | null;
    },
    txDb: DatabaseOrTx = db,
  ) {
    const [updated] = await txDb
      .update(importRow)
      .set(patch)
      .where(eq(importRow.id, id))
      .returning();
    return updated;
  }
}
