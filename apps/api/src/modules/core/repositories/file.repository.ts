import { and, desc, eq, isNull, lt, sql, type SQL } from '@idmis/db';
import { db, file } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { RequestScope } from '../../../platform/context';
import { ConflictProblemException } from '../../../platform/filters';
import type { DbClient, TransactionClient } from '../../../platform/database/transaction.helper';

export type DatabaseOrTx = DbClient | TransactionClient;

export interface CreateFileData {
  id: string;
  storageKey: string;
  originalName?: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus?: 'pending' | 'clean' | 'infected' | 'failed';
  ownerEntity?: string | null;
  ownerId?: string | null;
  createdBy?: string | null;
}

export interface UpdateFileData {
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  scanStatus?: 'pending' | 'clean' | 'infected' | 'failed';
  updatedBy?: string;
}

@Injectable()
export class FileRepository {
  /**
   * Finds a file by ID.
   */
  async findById(id: string, _scope?: RequestScope, txDb: DatabaseOrTx = db) {
    const conditions: SQL[] = [eq(file.id, id), isNull(file.deletedAt)];

    const [row] = await txDb
      .select()
      .from(file)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  /**
   * Finds a file by unique storageKey.
   */
  async findByStorageKey(storageKey: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(file)
      .where(and(eq(file.storageKey, storageKey), isNull(file.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Creates a file record inside transaction or default db.
   */
  async create(data: CreateFileData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [row] = await txDb
      .insert(file)
      .values({
        id: data.id,
        storageKey: data.storageKey,
        originalName: data.originalName ?? null,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        scanStatus: data.scanStatus ?? 'pending',
        ownerEntity: data.ownerEntity ?? null,
        ownerId: data.ownerId ?? null,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();
    return row;
  }

  /**
   * Updates file details checking optimistic concurrency version.
   */
  async update(id: string, expectedVersion: number, data: UpdateFileData, txDb: DatabaseOrTx = db) {
    const [updated] = await txDb
      .update(file)
      .set({
        ...data,
        version: sql`${file.version} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(file.id, id), eq(file.version, expectedVersion), isNull(file.deletedAt)))
      .returning();

    if (!updated) {
      const existing = await txDb.select().from(file).where(eq(file.id, id)).limit(1);
      throw new ConflictProblemException({
        detail: 'File record version mismatch or file not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }
    return updated;
  }

  /**
   * Soft deletes a file.
   */
  async softDelete(id: string, deletedBy?: string | null, txDb: DatabaseOrTx = db) {
    const [deleted] = await txDb
      .update(file)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy ?? '00000000-0000-7000-8000-000000000001',
      })
      .where(and(eq(file.id, id), isNull(file.deletedAt)))
      .returning();
    return deleted ?? null;
  }

  /**
   * Finds pending files older than threshold for cleanup.
   */
  async findExpiredPendingFiles(olderThan: Date, limit = 100, txDb: DatabaseOrTx = db) {
    return txDb
      .select()
      .from(file)
      .where(
        and(
          eq(file.scanStatus, 'pending'),
          lt(file.createdAt, olderThan.toISOString()),
          isNull(file.deletedAt),
        ),
      )
      .orderBy(desc(file.createdAt))
      .limit(limit);
  }
}
