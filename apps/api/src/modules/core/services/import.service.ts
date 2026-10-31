import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  permissions,
  type InitiateImportInput,
  type ListImportBatchesQuery,
  type ImportRowStatus,
  type ImportProgressMessage,
} from '@idmis/contracts';
import { db, organisationState, file, importRow, outboxEvent, eq, and, isNull } from '@idmis/db';
import { ImportRepository } from '../repositories/import.repository';
import { ImportTemplateService } from './import-template.service';
import { ImportHandlerRegistry } from '../imports/import-handler.registry';
import { StorageService } from '../../../platform/storage/storage.service';
import { EncryptionService } from '../../../platform/security/encryption.service';
import { RedisService } from '../../../platform/redis/redis.service';
import { type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';

export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_IMPORT_ROWS = 50000;

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly runningValidations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly importRepo: ImportRepository,
    private readonly templateService: ImportTemplateService,
    private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => ImportHandlerRegistry))
    private readonly registry: ImportHandlerRegistry,
  ) {}

  private getEmbeddedTemplateVersion(workbook: ExcelJS.Workbook): number | null {
    // 1. Check hidden _metadata worksheet
    const metaSheet = workbook.getWorksheet('_metadata');
    if (metaSheet) {
      for (let i = 1; i <= metaSheet.rowCount; i++) {
        const key = String(metaSheet.getCell(`A${i}`).value || '')
          .trim()
          .toLowerCase();
        if (key === 'template_version') {
          const val = Number(metaSheet.getCell(`B${i}`).value);
          if (!isNaN(val) && val > 0) return val;
        }
      }
    }
    // 2. Check workbook description JSON / string
    if (workbook.description) {
      try {
        const parsed = JSON.parse(workbook.description);
        if (typeof parsed.version === 'number') return parsed.version;
      } catch {
        const match = workbook.description.match(/TemplateVersion:(\d+)/i);
        if (match) return parseInt(match[1], 10);
      }
    }
    // 3. Check workbook keywords
    if (workbook.keywords) {
      const match = workbook.keywords.match(/templateVersion:(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    // 4. Check workbook subject
    if (workbook.subject) {
      const sub = parseInt(workbook.subject, 10);
      if (!isNaN(sub) && sub > 0) return sub;
    }
    return null;
  }

  async initiateImport(input: InitiateImportInput, authz: UserAuthz) {
    const handler = this.registry.get(input.dataset);
    if (!handler) {
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

    if (fileRow.sizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size (${Math.round(fileRow.sizeBytes / (1024 * 1024))}MB) exceeds maximum import limit of 50 MB`,
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

    const scope = authz.scopeFor(handler.permission);
    const baseScope = authz.scopeFor(permissions.CORE_IMPORT_RUN);

    if (!scope.isNational && !baseScope.isNational) {
      const hasStateAccess =
        (derivedStateId && scope.stateIds && scope.stateIds.includes(derivedStateId)) ||
        (derivedStateId && baseScope.stateIds && baseScope.stateIds.includes(derivedStateId));
      const hasSchemeAccess =
        (input.schemeId && scope.schemeIds && scope.schemeIds.includes(input.schemeId)) ||
        (input.schemeId && baseScope.schemeIds && baseScope.schemeIds.includes(input.schemeId));
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

    const handler = this.registry.get(batch.dataset);
    const scope = handler
      ? authz.scopeFor(handler.permission)
      : authz.scopeFor(permissions.CORE_IMPORT_RUN);
    const baseScope = authz.scopeFor(permissions.CORE_IMPORT_RUN);

    if (!scope.isNational && !baseScope.isNational) {
      const matchState =
        (batch.stateId && scope.stateIds?.includes(batch.stateId)) ||
        (batch.stateId && baseScope.stateIds?.includes(batch.stateId));
      const matchScheme =
        (batch.schemeId && scope.schemeIds?.includes(batch.schemeId)) ||
        (batch.schemeId && baseScope.schemeIds?.includes(batch.schemeId));
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
    const existing = this.runningValidations.get(batchId);
    if (existing) {
      return existing;
    }
    const promise = this.executeValidateBatch(batchId);
    this.runningValidations.set(batchId, promise);
    try {
      return await promise;
    } finally {
      this.runningValidations.delete(batchId);
    }
  }

  private async executeValidateBatch(batchId: string) {
    const batch = await this.importRepo.getBatchById(batchId);
    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    const handler = this.registry.get(batch.dataset);
    if (!handler) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: `Unsupported dataset handler: ${batch.dataset}`,
      });
      return;
    }

    await this.importRepo.updateBatch(batchId, { status: 'validating' });
    await this.publishProgress(batchId, batch.dataset, 'validating', 10, 'Reading file contents');

    const [fileRow] = await db.select().from(file).where(eq(file.id, batch.fileId)).limit(1);
    if (!fileRow) {
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage: 'Source file missing',
      });
      return;
    }

    if (fileRow.sizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
      const errorMessage = `File size exceeds maximum allowed limit of 50 MB for imports (found ${Math.round(fileRow.sizeBytes / (1024 * 1024))}MB)`;
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage,
      });
      await this.publishProgress(batchId, batch.dataset, 'validation_failed', 100, errorMessage);
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

    // 1. Template Version Gate: refuse workbooks whose embedded template version ≠ handler version
    const embeddedVersion = this.getEmbeddedTemplateVersion(workbook);
    if (!embeddedVersion || embeddedVersion !== handler.version) {
      const errorMessage = `Workbook template version mismatch. Expected version ${handler.version} but found ${embeddedVersion ?? 'none'}. Please download the latest template.`;
      await this.importRepo.updateBatch(batchId, {
        status: 'validation_failed',
        errorMessage,
      });
      await this.publishProgress(batchId, batch.dataset, 'validation_failed', 100, errorMessage);

      await db.insert(outboxEvent).values({
        eventType: 'core.import.validated',
        eventVersion: 1,
        aggregateType: 'import_batch',
        aggregateId: batchId,
        payload: {
          batchId,
          dataset: batch.dataset,
          totalRows: 0,
          validRows: 0,
          errorRows: 0,
          status: 'validation_failed',
          errorMessage,
        },
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

    // 2. Caps: Max rows check (50,000) - reject before parsing fully
    const totalDataRows = worksheet.rowCount - 1;
    if (totalDataRows > MAX_IMPORT_ROWS) {
      const errorMessage = `Workbook exceeds maximum row limit of ${MAX_IMPORT_ROWS.toLocaleString()} rows (found ${totalDataRows.toLocaleString()} rows)`;
      await this.importRepo.updateBatch(batchId, {
        totalRows: totalDataRows,
        status: 'validation_failed',
        errorMessage,
      });
      await this.publishProgress(batchId, batch.dataset, 'validation_failed', 100, errorMessage, {
        totalRows: totalDataRows,
      });

      await db.insert(outboxEvent).values({
        eventType: 'core.import.validated',
        eventVersion: 1,
        aggregateType: 'import_batch',
        aggregateId: batchId,
        payload: {
          batchId,
          dataset: batch.dataset,
          totalRows: totalDataRows,
          validRows: 0,
          errorRows: totalDataRows,
          status: 'validation_failed',
          errorMessage,
        },
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

      // Match handler column definition
      const matched = handler.columns.find((c) => {
        const colNameLower = c.name.toLowerCase();
        const colHeaderLower = c.header.toLowerCase().replace(/\s*\*/g, '');
        return val === colNameLower || val === colHeaderLower;
      });

      if (matched) {
        colMap.set(colNumber, matched.name);
        return;
      }

      // Dataset-agnostic fallback heuristics
      if (val.includes('name') && (val.includes('wua') || val.includes('group')))
        colMap.set(colNumber, 'name');
      else if (val.includes('reg') || val.includes('registration')) colMap.set(colNumber, 'regNo');
      else if (val === 'level') colMap.set(colNumber, 'level');
      else if (val.includes('scheme')) colMap.set(colNumber, 'schemeCode');
      else if (val.includes('ward')) colMap.set(colNumber, 'wardCode');
      else if (val.includes('address')) colMap.set(colNumber, 'address');
      else if (val.includes('bank name')) colMap.set(colNumber, 'bankName');
      else if (val.includes('account')) colMap.set(colNumber, 'bankAccountNumber');
      else if (val.includes('operational')) colMap.set(colNumber, 'isOperational');
      else if (val.includes('maintenance')) colMap.set(colNumber, 'hasMaintenanceFund');
      else if (val.includes('phone')) colMap.set(colNumber, 'phone');
      else if (val.includes('balance') || val.includes('amount')) colMap.set(colNumber, 'balance');
      else {
        const headerText = String(cell.value || '').trim();
        if (headerText) colMap.set(colNumber, headerText);
      }
    });

    const rowsToInsert: Parameters<typeof this.importRepo.createRows>[0] = [];
    const seenNaturalKeys = new Set<string>();
    let validCount = 0;
    let errorCount = 0;

    // Scope for validation: National or batch state/scheme
    const scope: import('@idmis/contracts').RequestScope = {
      isNational: !batch.stateId && !batch.schemeId,
      stateIds: batch.stateId ? [batch.stateId] : [],
      rbdaIds: [],
      schemeIds: batch.schemeId ? [batch.schemeId] : [],
      sectorIds: [],
    };

    await runInTransaction(async (txDb) => {
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        if (!row.hasValues) continue;

        let rawData: Record<string, unknown> = {};
        const errors: Array<{ column: string; message: string; code?: string }> = [];

        colMap.forEach((fieldKey, colNumber) => {
          const cell = row.getCell(colNumber);
          let cellVal: unknown = cell.value;
          const isFormula =
            cell.type === ExcelJS.ValueType.Formula ||
            Boolean(cell.formula) ||
            (cellVal !== null && typeof cellVal === 'object' && 'formula' in cellVal);

          if (cellVal !== null && typeof cellVal === 'object' && 'result' in cellVal) {
            cellVal = (cellVal as { result: unknown }).result;
          }

          // On IMPORT: reject formula cells and strings starting with '='
          const isStringFormula = typeof cellVal === 'string' && cellVal.startsWith('=');
          if (isFormula || isStringFormula) {
            errors.push({
              column: fieldKey,
              message: 'Formula cells and values starting with = are forbidden',
              code: 'FORMULA_FORBIDDEN',
            });
          }

          rawData[fieldKey] = cellVal;
        });

        // Skip completely empty rows
        const hasAnyValue = Object.values(rawData).some(
          (v) => v !== null && v !== undefined && String(v).trim() !== '',
        );
        if (!hasAnyValue) continue;

        // Parse row through handler
        const parseResult = await handler.parseRow(rawData, { batch });
        rawData = parseResult.rawData;
        const parsedData = parseResult.parsedData;
        if (parseResult.errors) {
          errors.push(...parseResult.errors);
        }

        // Natural key duplicate detection in same file
        const naturalKey = handler.naturalKey(parsedData, rawData);
        if (naturalKey) {
          if (seenNaturalKeys.has(naturalKey)) {
            errors.push({
              column: handler.columns[0]?.name || 'naturalKey',
              message: `Duplicate natural key '${naturalKey}' found in the same file`,
              code: 'DUPLICATE_NATURAL_KEY',
            });
          } else {
            seenNaturalKeys.add(naturalKey);
          }
        }

        // Validate row through handler
        const validationErrors = await handler.validateRow(
          { rowNumber, rawData, parsedData },
          scope,
          txDb,
        );
        errors.push(...validationErrors);

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

      await txDb.delete(importRow).where(eq(importRow.batchId, batchId));
      await this.importRepo.createRows(rowsToInsert, txDb);
    });

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
      batch.dataset,
      finalStatus,
      100,
      `Validation complete. ${validCount} valid, ${errorCount} errors.`,
      { totalRows, validRows: validCount, errorRows: errorCount },
    );

    // Write outbox event
    await db.insert(outboxEvent).values({
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

    const handler = this.registry.get(batch.dataset);
    if (!handler) {
      throw new BadRequestException(`Unsupported dataset handler: ${batch.dataset}`);
    }

    // Gate 2: Commit Gate — verify current user's active scope covers all rows
    const commitScope = authz.scopeFor(handler.permission);
    if (!commitScope.isNational) {
      const validRowsForCheck = await this.importRepo.listRows(batchId, {
        status: 'valid',
        limit: 10000,
      });

      for (const row of validRowsForCheck) {
        const data = row.parsedData as Record<string, unknown>;
        const rowStateId = (data.stateId as string | undefined) ?? batch.stateId ?? null;
        const rowSchemeId =
          (data.schemeId as string | undefined) ??
          (data.organisationId as string | undefined) ??
          batch.schemeId ??
          null;

        const stateMatch = Boolean(rowStateId && commitScope.stateIds?.includes(rowStateId));
        const schemeMatch = Boolean(rowSchemeId && commitScope.schemeIds?.includes(rowSchemeId));

        if (!stateMatch && !schemeMatch) {
          throw new ForbiddenException('Target location is outside your assigned scope');
        }
      }
    }

    await this.importRepo.updateBatch(batchId, { status: 'committing' });
    await this.publishProgress(
      batchId,
      batch.dataset,
      'committing',
      10,
      'Starting commit transaction',
    );

    const validRows = await this.importRepo.listRows(batchId, {
      status: 'valid',
      limit: 10000,
    });

    await runInTransaction(
      async (txDb) => {
        let committedCount = 0;

        for (const row of validRows) {
          const { targetEntityId, beforeImage } = await handler.commitRow(
            {
              id: row.id,
              rowNumber: row.rowNumber,
              rawData: row.rawData as Record<string, unknown>,
              parsedData: row.parsedData as Record<string, unknown>,
              batchId,
            },
            authz,
            txDb,
          );

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
      batch.dataset,
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

    const handler = this.registry.get(batch.dataset);
    if (!handler) {
      throw new BadRequestException(`Unsupported dataset handler: ${batch.dataset}`);
    }

    await this.importRepo.updateBatch(batchId, { status: 'undoing' });
    await this.publishProgress(batchId, batch.dataset, 'undoing', 10, 'Starting undo operation');

    const committedRows = await this.importRepo.listRows(batchId, {
      status: 'committed',
      limit: 10000,
    });

    const skippedRows: Array<{ rowNumber: number; entityId: string; reason: string }> = [];
    let undoneRowsCount = 0;

    await runInTransaction(
      async (txDb) => {
        for (const row of committedRows) {
          if (!row.targetEntityId) continue;

          const res = await handler.undoRow(
            {
              id: row.id,
              rowNumber: row.rowNumber,
              targetEntityId: row.targetEntityId,
              beforeImage: row.beforeImage as Record<string, unknown> | null,
              parsedData: row.parsedData,
            },
            authz,
            txDb,
          );

          if (res.skipped) {
            skippedRows.push({
              rowNumber: row.rowNumber,
              entityId: row.targetEntityId,
              reason: res.reason ?? 'Skipped by dataset handler',
            });
          } else {
            undoneRowsCount++;
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
            undoneRowsCount,
            skippedRowsCount: skippedRows.length,
            skippedRows,
          },
        });

        const errorMessage =
          skippedRows.length > 0
            ? `Undo completed with ${skippedRows.length} row(s) skipped due to subsequent modifications or active references`
            : null;

        await this.importRepo.updateBatch(
          batchId,
          {
            status: 'undone',
            undoneAt: new Date().toISOString(),
            errorMessage,
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

    await this.publishProgress(
      batchId,
      batch.dataset,
      'undone',
      100,
      `Undo completed: ${undoneRowsCount} undone, ${skippedRows.length} skipped.`,
    );

    const finalBatch = await this.importRepo.getBatchById(batchId);
    return {
      ...finalBatch!,
      undoneRowsCount,
      skippedRowsCount: skippedRows.length,
      skippedRows,
    };
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
    dataset: string,
    status: ImportProgressMessage['status'],
    progress: number,
    message?: string,
    extra?: Partial<ImportProgressMessage>,
  ) {
    const payload: ImportProgressMessage = {
      batchId,
      dataset,
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
