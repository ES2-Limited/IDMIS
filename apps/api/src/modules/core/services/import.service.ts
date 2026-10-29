import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  permissions,
  sanitizeFormulaSafety,
  type InitiateImportInput,
  type ListImportBatchesQuery,
  type ImportRowStatus,
  type ImportProgressMessage,
} from '@idmis/contracts';
import {
  db,
  wua,
  organisation,
  organisationState,
  ward,
  lga,
  file,
  importRow,
  outboxEvent,
  eq,
  and,
  isNull,
} from '@idmis/db';
import { ImportRepository } from '../repositories/import.repository';
import { StorageService } from '../../../platform/storage/storage.service';
import { EncryptionService } from '../../../platform/security/encryption.service';
import { RedisService } from '../../../platform/redis/redis.service';
import { type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly importRepo: ImportRepository,
    private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  async initiateImport(input: InitiateImportInput, authz: UserAuthz) {
    if (input.dataset !== 'wua') {
      throw new BadRequestException(`Unsupported dataset: ${input.dataset}`);
    }

    // 1. Verify file exists and is scanned clean
    const [fileRow] = await db
      .select()
      .from(file)
      .where(and(eq(file.id, input.fileId), isNull(file.deletedAt)))
      .limit(1);

    if (!fileRow) {
      throw new NotFoundException(`Uploaded file with id ${input.fileId} not found`);
    }

    if (fileRow.scanStatus !== 'clean') {
      throw new BadRequestException(
        `File cannot be imported: scan status is '${fileRow.scanStatus}' (must be 'clean')`,
      );
    }

    // 2. Validate scope
    let derivedStateId = input.stateId ?? null;
    if (input.schemeId && !derivedStateId) {
      const [link] = await db
        .select()
        .from(organisationState)
        .where(eq(organisationState.organisationId, input.schemeId))
        .limit(1);
      derivedStateId = link?.stateId ?? null;
    }

    const scope = authz.scopeFor(permissions.CORE_IMPORT_RUN);
    if (!scope.isNational) {
      const hasStateAccess =
        derivedStateId && scope.stateIds && scope.stateIds.includes(derivedStateId);
      const hasSchemeAccess =
        input.schemeId && scope.schemeIds && scope.schemeIds.includes(input.schemeId);
      if (!hasStateAccess && !hasSchemeAccess) {
        throw new ForbiddenException('Target location is outside your assigned scope');
      }
    }

    // 3. Create batch in transaction with audit log & outbox event
    const batch = await runInTransaction(
      async (txDb) => {
        const created = await this.importRepo.createBatch(
          {
            dataset: input.dataset,
            fileId: input.fileId,
            schemeId: input.schemeId,
            stateId: derivedStateId,
            createdBy: authz.userId,
          },
          txDb,
        );

        // Write outbox event
        await txDb.insert(outboxEvent).values({
          eventType: 'core.import.uploaded',
          eventVersion: 1,
          aggregateType: 'import_batch',
          aggregateId: created.id,
          payload: {
            batchId: created.id,
            dataset: created.dataset,
            fileId: created.fileId,
            schemeId: created.schemeId,
            stateId: created.stateId,
            uploadedBy: authz.userId,
          },
        });

        return created;
      },
      {
        audit: {
          action: 'create',
          entity: 'core.import_batch',
          stateId: derivedStateId ?? undefined,
          actorType: 'user',
          actorUserId: authz.userId,
        },
      },
    );

    // 4. Run validation asynchronously
    void this.validateBatch(batch.id).catch((err) => {
      this.logger.error(`Validation failed for batch ${batch.id}: ${(err as Error).message}`);
    });

    return batch;
  }

  async listBatches(query: ListImportBatchesQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.CORE_IMPORT_RUN);
    return this.importRepo.listBatches(scope, query);
  }

  async getBatch(batchId: string, authz: UserAuthz) {
    const batch = await this.importRepo.getBatchById(batchId);
    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    const scope = authz.scopeFor(permissions.CORE_IMPORT_RUN);
    if (!scope.isNational) {
      const matchState = batch.stateId && scope.stateIds?.includes(batch.stateId);
      const matchScheme = batch.schemeId && scope.schemeIds?.includes(batch.schemeId);
      if (!matchState && !matchScheme) {
        throw new NotFoundException(`Import batch ${batchId} not found`);
      }
    }

    return batch;
  }

  async getPreview(
    batchId: string,
    query: { page?: number; limit?: number; status?: ImportRowStatus },
    authz: UserAuthz,
  ) {
    const batch = await this.getBatch(batchId, authz);
    const rows = await this.importRepo.listRows(batchId, query);

    return {
      batch,
      rows: rows.map((r) => ({
        id: r.id,
        batchId: r.batchId,
        rowNumber: r.rowNumber,
        rawData: r.rawData,
        status: r.status,
        errors: r.errors,
        naturalKey: r.naturalKey,
        targetEntityId: r.targetEntityId,
      })),
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      totalRows: batch.totalRows,
      totalErrorRows: batch.errorRows,
      totalValidRows: batch.validRows,
    };
  }

  async validateBatch(batchId: string) {
    const batch = await this.importRepo.getBatchById(batchId);
    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    await this.importRepo.updateBatch(batchId, { status: 'validating' });
    await this.publishProgress(batchId, 'validating', 10, 'Reading file contents');

    const [fileRow] = await db.select().from(file).where(eq(file.id, batch.fileId)).limit(1);
    if (!fileRow) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: 'Source file missing',
      });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await this.storageService.getObjectBuffer(fileRow.storageKey);
    } catch (err) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: `Failed to read file from storage: ${(err as Error).message}`,
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        fileBuffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
      );
    } catch (err) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: `Invalid Excel format: ${(err as Error).message}`,
      });
      return;
    }

    const worksheet = workbook.getWorksheet('Data') || workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: 'Excel sheet has no data rows',
      });
      return;
    }

    // Map headers
    const headerRow = worksheet.getRow(1);
    const colMap = new Map<number, string>();
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '')
        .trim()
        .toLowerCase()
        .replace(/\s*\*/g, '');
      if (val.includes('name') && val.includes('wua')) colMap.set(colNumber, 'name');
      else if (val.includes('reg') || val.includes('registration')) colMap.set(colNumber, 'regNo');
      else if (val === 'level') colMap.set(colNumber, 'level');
      else if (val.includes('scheme')) colMap.set(colNumber, 'schemeCode');
      else if (val.includes('ward')) colMap.set(colNumber, 'wardCode');
      else if (val.includes('address')) colMap.set(colNumber, 'address');
      else if (val.includes('bank name')) colMap.set(colNumber, 'bankName');
      else if (val.includes('account')) colMap.set(colNumber, 'bankAccountNumber');
      else if (val.includes('operational')) colMap.set(colNumber, 'isOperational');
      else if (val.includes('maintenance')) colMap.set(colNumber, 'hasMaintenanceFund');
    });

    const rowsToInsert: Parameters<typeof this.importRepo.createRows>[0] = [];
    const seenNaturalKeys = new Set<string>();
    let validCount = 0;
    let errorCount = 0;

    // Cache organisations & wards for fast lookup
    const allSchemes = await db
      .select({
        id: organisation.id,
        code: organisation.code,
        stateId: organisationState.stateId,
      })
      .from(organisation)
      .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
      .where(isNull(organisation.deletedAt));
    const schemeMap = new Map(allSchemes.map((s) => [s.code.toUpperCase(), s]));

    const allWards = await db
      .select({ id: ward.id, code: ward.code, stateId: lga.stateId })
      .from(ward)
      .innerJoin(lga, eq(ward.lgaId, lga.id));
    const wardMap = new Map(allWards.map((w) => [w.code.toUpperCase(), w]));

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      const rawData: Record<string, unknown> = {};
      const errors: Array<{ column: string; message: string; code?: string }> = [];

      colMap.forEach((fieldKey, colNumber) => {
        let cellVal: unknown = row.getCell(colNumber).value;
        if (cellVal !== null && typeof cellVal === 'object' && 'result' in cellVal) {
          cellVal = (cellVal as { result: unknown }).result;
        }
        // Formula injection protection
        const sanitized = sanitizeFormulaSafety(cellVal);
        rawData[fieldKey] = sanitized;
      });

      // Skip row if it looks completely empty
      if (Object.keys(rawData).length === 0 || !rawData.name) continue;

      const parsedData: Record<string, unknown> = { ...rawData };

      // Field Validations
      const name = String(rawData.name || '').trim();
      if (!name) {
        errors.push({ column: 'name', message: 'WUA Name is required' });
      }

      const level = String(rawData.level || '')
        .trim()
        .toLowerCase();
      if (!['apex', 'sector', 'unit'].includes(level)) {
        errors.push({
          column: 'level',
          message: "Level must be one of 'apex', 'sector', or 'unit'",
        });
      } else {
        parsedData.level = level;
      }

      const schemeCode = String(rawData.schemeCode || '')
        .trim()
        .toUpperCase();
      if (!schemeCode) {
        errors.push({ column: 'schemeCode', message: 'Scheme Code is required' });
      } else {
        const foundScheme = schemeMap.get(schemeCode);
        if (!foundScheme) {
          errors.push({
            column: 'schemeCode',
            message: `Referenced Scheme Code '${schemeCode}' does not exist`,
          });
        } else {
          parsedData.organisationId = foundScheme.id;
          parsedData.stateId = foundScheme.stateId;
        }
      }

      if (rawData.wardCode) {
        const wardCode = String(rawData.wardCode).trim().toUpperCase();
        const foundWard = wardMap.get(wardCode);
        if (!foundWard) {
          errors.push({
            column: 'wardCode',
            message: `Referenced Ward Code '${wardCode}' does not exist`,
          });
        } else {
          parsedData.wardId = foundWard.id;
        }
      }

      // Natural Key duplicate detection
      const regNo = rawData.regNo ? String(rawData.regNo).trim() : null;
      const naturalKey = regNo ? `${regNo}#${schemeCode}` : `${name}#${schemeCode}`;
      if (seenNaturalKeys.has(naturalKey)) {
        errors.push({
          column: 'regNo',
          message: `Duplicate natural key '${naturalKey}' found in the same file`,
        });
      } else {
        seenNaturalKeys.add(naturalKey);
      }

      // Boolean parsing
      if (rawData.isOperational !== undefined) {
        parsedData.isOperational = Boolean(
          rawData.isOperational === true ||
          String(rawData.isOperational).toLowerCase() === 'true' ||
          String(rawData.isOperational).toLowerCase() === 'yes',
        );
      }
      if (rawData.hasMaintenanceFund !== undefined) {
        parsedData.hasMaintenanceFund = Boolean(
          rawData.hasMaintenanceFund === true ||
          String(rawData.hasMaintenanceFund).toLowerCase() === 'true' ||
          String(rawData.hasMaintenanceFund).toLowerCase() === 'yes',
        );
      }

      const status: ImportRowStatus = errors.length === 0 ? 'valid' : 'error';
      if (status === 'valid') validCount++;
      else errorCount++;

      rowsToInsert.push({
        batchId,
        rowNumber,
        rawData,
        parsedData,
        status,
        errors,
        naturalKey,
      });
    }

    await db.delete(importRow).where(eq(importRow.batchId, batchId));
    await this.importRepo.createRows(rowsToInsert);

    const totalRows = rowsToInsert.length;
    const finalStatus = errorCount === 0 && totalRows > 0 ? 'validated' : 'validation_failed';

    const updatedBatch = await this.importRepo.updateBatch(batchId, {
      totalRows,
      validRows: validCount,
      errorRows: errorCount,
      status: finalStatus,
      errorMessage: errorCount > 0 ? `Validation failed with ${errorCount} error row(s)` : null,
    });

    await this.publishProgress(
      batchId,
      finalStatus,
      100,
      `Validation complete. ${validCount} valid, ${errorCount} errors.`,
      { totalRows, validRows: validCount, errorRows: errorCount },
    );

    // Write outbox event
    await db.insert((await import('@idmis/db')).outboxEvent).values({
      eventType: 'core.import.validated',
      eventVersion: 1,
      aggregateType: 'import_batch',
      aggregateId: batchId,
      payload: {
        batchId,
        dataset: batch.dataset,
        totalRows,
        validRows: validCount,
        errorRows: errorCount,
        status: finalStatus,
      },
    });

    return updatedBatch;
  }

  async commitBatch(batchId: string, authz: UserAuthz) {
    const batch = await this.getBatch(batchId, authz);
    if (batch.status !== 'validated') {
      throw new BadRequestException(
        `Cannot commit batch in status '${batch.status}' (must be 'validated')`,
      );
    }

    await this.importRepo.updateBatch(batchId, { status: 'committing' });
    await this.publishProgress(batchId, 'committing', 10, 'Starting commit transaction');

    const validRows = await this.importRepo.listRows(batchId, {
      status: 'valid',
      limit: 10000,
    });

    await runInTransaction(
      async (txDb) => {
        let committedCount = 0;

        for (const row of validRows) {
          const data = row.parsedData as Record<string, unknown>;
          const orgId = data.organisationId as string;
          const regNo = data.regNo ? String(data.regNo) : null;
          const name = String(data.name);

          // Check for existing record
          const existingQuery = regNo
            ? and(eq(wua.organisationId, orgId), eq(wua.regNo, regNo), isNull(wua.deletedAt))
            : and(eq(wua.organisationId, orgId), eq(wua.name, name), isNull(wua.deletedAt));

          const [existing] = await txDb.select().from(wua).where(existingQuery).limit(1);

          let targetEntityId: string;
          let beforeImage: Record<string, unknown> | null = null;

          if (existing) {
            // Upsert: capture before-image
            beforeImage = {
              id: existing.id,
              name: existing.name,
              level: existing.level,
              regNo: existing.regNo,
              address: existing.address,
              bankName: existing.bankName,
              bankAccountEnc: existing.bankAccountEnc
                ? Buffer.from(existing.bankAccountEnc).toString('base64')
                : null,
              isOperational: existing.isOperational,
              hasMaintenanceFund: existing.hasMaintenanceFund,
              version: existing.version,
            };

            const bankAccountEnc = data.bankAccountNumber
              ? this.encryptionService.encrypt(String(data.bankAccountNumber))
              : existing.bankAccountEnc;

            const [updated] = await txDb
              .update(wua)
              .set({
                name,
                level: data.level as 'apex' | 'sector' | 'unit',
                address: data.address ? String(data.address) : existing.address,
                bankName: data.bankName ? String(data.bankName) : existing.bankName,
                bankAccountEnc,
                isOperational: (data.isOperational as boolean) ?? existing.isOperational,
                hasMaintenanceFund:
                  (data.hasMaintenanceFund as boolean) ?? existing.hasMaintenanceFund,
                importBatchId: batchId,
                updatedBy: authz.userId,
                updatedAt: new Date().toISOString(),
                version: existing.version + 1,
              })
              .where(eq(wua.id, existing.id))
              .returning();

            targetEntityId = updated!.id;
          } else {
            // Create new record
            const bankAccountEnc = data.bankAccountNumber
              ? this.encryptionService.encrypt(String(data.bankAccountNumber))
              : null;

            const [created] = await txDb
              .insert(wua)
              .values({
                id: crypto.randomUUID(),
                organisationId: orgId,
                wardId: (data.wardId as string) || null,
                stateId: (data.stateId as string) || null,
                name,
                level: data.level as 'apex' | 'sector' | 'unit',
                regNo,
                address: data.address ? String(data.address) : null,
                bankName: data.bankName ? String(data.bankName) : null,
                bankAccountEnc,
                isOperational: Boolean(data.isOperational),
                hasMaintenanceFund: Boolean(data.hasMaintenanceFund),
                importBatchId: batchId,
                createdBy: authz.userId,
                updatedBy: authz.userId,
              })
              .returning();

            targetEntityId = created!.id;
          }

          await this.importRepo.updateRow(
            row.id,
            {
              status: 'committed',
              targetEntityId,
              beforeImage,
            },
            txDb,
          );

          committedCount++;
        }

        // Write outbox event
        await txDb.insert(outboxEvent).values({
          eventType: 'core.import.committed',
          eventVersion: 1,
          aggregateType: 'import_batch',
          aggregateId: batchId,
          payload: {
            batchId,
            dataset: batch.dataset,
            committedRows: committedCount,
            status: 'committed',
            committedBy: authz.userId,
          },
        });

        await this.importRepo.updateBatch(
          batchId,
          {
            status: 'committed',
            committedRows: committedCount,
            committedAt: new Date().toISOString(),
          },
          batch.version,
          txDb,
        );
      },
      {
        audit: {
          action: 'import',
          entity: 'core.import_batch',
          entityId: batchId,
          stateId: batch.stateId ?? undefined,
          actorType: 'user',
          actorUserId: authz.userId,
        },
      },
    );

    await this.publishProgress(
      batchId,
      'committed',
      100,
      `Successfully committed ${validRows.length} rows.`,
      { committedRows: validRows.length },
    );

    return this.importRepo.getBatchById(batchId);
  }

  async undoBatch(batchId: string, authz: UserAuthz) {
    const batch = await this.getBatch(batchId, authz);
    if (batch.status !== 'committed') {
      throw new BadRequestException(
        `Cannot undo batch in status '${batch.status}' (must be 'committed')`,
      );
    }

    await this.importRepo.updateBatch(batchId, { status: 'undoing' });
    await this.publishProgress(batchId, 'undoing', 10, 'Starting undo operation');

    const committedRows = await this.importRepo.listRows(batchId, {
      status: 'committed',
      limit: 10000,
    });

    await runInTransaction(
      async (txDb) => {
        for (const row of committedRows) {
          if (!row.targetEntityId) continue;

          if (row.beforeImage) {
            // Restore previous state
            const prev = row.beforeImage as Record<string, unknown>;
            await txDb
              .update(wua)
              .set({
                name: prev.name as string,
                level: prev.level as 'apex' | 'sector' | 'unit',
                regNo: prev.regNo ? String(prev.regNo) : null,
                address: prev.address ? String(prev.address) : null,
                bankName: prev.bankName ? String(prev.bankName) : null,
                bankAccountEnc: prev.bankAccountEnc
                  ? Buffer.from(prev.bankAccountEnc as string, 'base64')
                  : null,
                isOperational: Boolean(prev.isOperational),
                hasMaintenanceFund: Boolean(prev.hasMaintenanceFund),
                updatedBy: authz.userId,
                updatedAt: new Date().toISOString(),
                version: ((prev.version as number) || 1) + 1,
              })
              .where(eq(wua.id, row.targetEntityId));
          } else {
            // Delete created record
            await txDb
              .update(wua)
              .set({
                deletedAt: new Date().toISOString(),
                updatedBy: authz.userId,
              })
              .where(eq(wua.id, row.targetEntityId));
          }
        }

        // Write outbox event
        await txDb.insert(outboxEvent).values({
          eventType: 'core.import.undone',
          eventVersion: 1,
          aggregateType: 'import_batch',
          aggregateId: batchId,
          payload: {
            batchId,
            dataset: batch.dataset,
            status: 'undone',
            undoneBy: authz.userId,
          },
        });

        await this.importRepo.updateBatch(
          batchId,
          {
            status: 'undone',
            undoneAt: new Date().toISOString(),
          },
          batch.version,
          txDb,
        );
      },
      {
        audit: {
          action: 'revert',
          entity: 'core.import_batch',
          entityId: batchId,
          stateId: batch.stateId ?? undefined,
          actorType: 'user',
          actorUserId: authz.userId,
        },
      },
    );

    await this.publishProgress(batchId, 'undone', 100, 'Successfully undone all batch changes.');

    return this.importRepo.getBatchById(batchId);
  }

  async generateSseToken(batchId: string, authz: UserAuthz) {
    await this.getBatch(batchId, authz);
    const token = crypto.randomBytes(24).toString('hex');
    const key = `import:sse:${token}`;
    await this.redisService.set(key, JSON.stringify({ batchId, userId: authz.userId }), 60);
    return { sseToken: token, expiresInSeconds: 60 };
  }

  async validateSseToken(batchId: string, token: string): Promise<boolean> {
    if (!token) return false;
    const key = `import:sse:${token}`;
    const dataStr = await this.redisService.get(key);
    if (!dataStr) return false;
    try {
      const data = JSON.parse(dataStr) as { batchId: string; userId: string };
      return data.batchId === batchId;
    } catch {
      return false;
    }
  }

  private async publishProgress(
    batchId: string,
    status: ImportProgressMessage['status'],
    progress: number,
    message?: string,
    extra?: Partial<ImportProgressMessage>,
  ) {
    const payload: ImportProgressMessage = {
      batchId,
      dataset: 'wua',
      status,
      progress,
      totalRows: extra?.totalRows ?? 0,
      processedRows: extra?.totalRows ?? 0,
      validRows: extra?.validRows ?? 0,
      errorRows: extra?.errorRows ?? 0,
      committedRows: extra?.committedRows ?? 0,
      message,
    };
    await this.redisService.publish(`import:progress:${batchId}`, JSON.stringify(payload));
  }
}
