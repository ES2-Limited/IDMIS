import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  permissions,
  WUA_IMPORT_DEFINITION,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  wua,
  wuaOfficer,
  organisation,
  organisationState,
  ward,
  lga,
  eq,
  and,
  isNull,
} from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from './import-handler.interface';
import { EncryptionService } from '../../../platform/security/encryption.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class WuaImportHandler implements ImportDatasetHandler {
  readonly dataset = 'wua';
  readonly version = WUA_IMPORT_DEFINITION.version;
  readonly permission = permissions.CORE_WUA_MANAGE;
  readonly columns: ImportColumnDefinition[] = WUA_IMPORT_DEFINITION.columns;

  constructor(private readonly encryptionService: EncryptionService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      name: 'Kano Central WUA',
      regNo: 'WUA-KN-001',
      level: 'unit',
      schemeCode: 'KRIS',
      wardCode: 'KURA-W-01',
      address: 'KM 12 Zaria Road, Kano',
      bankName: 'First Bank',
      bankAccountNumber: '1234567890',
      isOperational: true,
      hasMaintenanceFund: true,
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'WUA Name is required' });
    } else {
      parsedData.name = name;
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
      parsedData.schemeCode = schemeCode;
    }

    if (rawData.wardCode) {
      parsedData.wardCode = String(rawData.wardCode).trim().toUpperCase();
    }

    if (rawData.regNo) {
      parsedData.regNo = String(rawData.regNo).trim();
    }

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

    return { rawData, parsedData, errors };
  }

  async validateRow(
    row: {
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
    },
    scope: RequestScope,
    tx: TransactionClient,
  ): Promise<Array<{ column: string; message: string; code?: string }>> {
    const errors: Array<{ column: string; message: string; code?: string }> = [];
    const schemeCode = String(row.parsedData.schemeCode || '').toUpperCase();

    if (schemeCode) {
      const [foundScheme] = await tx
        .select({
          id: organisation.id,
          code: organisation.code,
          stateId: organisationState.stateId,
        })
        .from(organisation)
        .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
        .where(and(eq(organisation.code, schemeCode), isNull(organisation.deletedAt)))
        .limit(1);

      if (!foundScheme) {
        errors.push({
          column: 'schemeCode',
          message: `Referenced Scheme Code '${schemeCode}' does not exist`,
        });
      } else {
        row.parsedData.organisationId = foundScheme.id;
        row.parsedData.stateId = foundScheme.stateId;

        if (!scope.isNational) {
          const matchState = foundScheme.stateId && scope.stateIds?.includes(foundScheme.stateId);
          const matchScheme = scope.schemeIds?.includes(foundScheme.id);
          if (!matchState && !matchScheme) {
            errors.push({
              column: 'schemeCode',
              message: 'Target location is outside your assigned scope',
              code: 'out_of_scope',
            });
          }
        }
      }
    }

    if (row.parsedData.wardCode) {
      const wardCode = String(row.parsedData.wardCode).toUpperCase();
      const [foundWard] = await tx
        .select({ id: ward.id, code: ward.code, stateId: lga.stateId })
        .from(ward)
        .innerJoin(lga, eq(ward.lgaId, lga.id))
        .where(eq(ward.code, wardCode))
        .limit(1);

      if (!foundWard) {
        errors.push({
          column: 'wardCode',
          message: `Referenced Ward Code '${wardCode}' does not exist`,
        });
      } else {
        row.parsedData.wardId = foundWard.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || '').toUpperCase();
    const regNo = parsedData.regNo ? String(parsedData.regNo).trim() : null;
    const name = String(parsedData.name || '').trim();
    return regNo ? `${regNo}#${schemeCode}` : `${name}#${schemeCode}`;
  }

  async commitRow(
    row: {
      id: string;
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
      batchId: string;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<CommitRowResult> {
    const data = row.parsedData;
    const orgId = data.organisationId as string;
    const regNo = data.regNo ? String(data.regNo) : null;
    const name = String(data.name);

    const existingQuery = regNo
      ? and(eq(wua.organisationId, orgId), eq(wua.regNo, regNo), isNull(wua.deletedAt))
      : and(eq(wua.organisationId, orgId), eq(wua.name, name), isNull(wua.deletedAt));

    const [existing] = await tx.select().from(wua).where(existingQuery).limit(1);

    let targetEntityId: string;
    let beforeImage: Record<string, unknown> | null = null;

    if (existing) {
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

      const [updated] = await tx
        .update(wua)
        .set({
          name,
          level: data.level as 'apex' | 'sector' | 'unit',
          address: data.address ? String(data.address) : existing.address,
          bankName: data.bankName ? String(data.bankName) : existing.bankName,
          bankAccountEnc,
          isOperational: (data.isOperational as boolean) ?? existing.isOperational,
          hasMaintenanceFund: (data.hasMaintenanceFund as boolean) ?? existing.hasMaintenanceFund,
          importBatchId: row.batchId,
          updatedBy: authz.userId,
          updatedAt: new Date().toISOString(),
          version: existing.version + 1,
        })
        .where(eq(wua.id, existing.id))
        .returning();

      targetEntityId = updated!.id;
    } else {
      const bankAccountEnc = data.bankAccountNumber
        ? this.encryptionService.encrypt(String(data.bankAccountNumber))
        : null;

      const [created] = await tx
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
          importBatchId: row.batchId,
          createdBy: authz.userId,
          updatedBy: authz.userId,
        })
        .returning();

      targetEntityId = created!.id;
    }

    return { targetEntityId, beforeImage };
  }

  async undoRow(
    row: {
      id: string;
      rowNumber: number;
      targetEntityId: string;
      beforeImage: Record<string, unknown> | null;
      parsedData?: unknown;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult> {
    const [current] = await tx
      .select()
      .from(wua)
      .where(and(eq(wua.id, row.targetEntityId), isNull(wua.deletedAt)))
      .limit(1);

    if (!current) {
      return {
        skipped: true,
        reason: 'Record no longer exists or was already deleted',
      };
    }

    if (row.beforeImage) {
      const prev = row.beforeImage as Record<string, unknown>;
      const expectedVersion = ((prev.version as number) || 1) + 1;

      if (current.version !== expectedVersion) {
        return {
          skipped: true,
          reason: `Record version mismatch: expected ${expectedVersion} but found ${current.version} (modified after import)`,
        };
      }

      await tx
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
          version: current.version + 1,
        })
        .where(eq(wua.id, row.targetEntityId));

      return { skipped: false };
    } else {
      const expectedVersion = 1;
      if (current.version !== expectedVersion) {
        return {
          skipped: true,
          reason: `Record version mismatch: expected ${expectedVersion} but found ${current.version} (modified after import)`,
        };
      }

      const [officerRef] = await tx
        .select({ id: wuaOfficer.id })
        .from(wuaOfficer)
        .where(and(eq(wuaOfficer.wuaId, row.targetEntityId), isNull(wuaOfficer.deletedAt)))
        .limit(1);

      const [childWuaRef] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(and(eq(wua.parentId, row.targetEntityId), isNull(wua.deletedAt)))
        .limit(1);

      if (officerRef || childWuaRef) {
        return {
          skipped: true,
          reason: 'Inserted record is referenced by other records (officers or child WUAs)',
        };
      }

      await tx
        .update(wua)
        .set({
          deletedAt: new Date().toISOString(),
          updatedBy: authz.userId,
        })
        .where(eq(wua.id, row.targetEntityId));

      return { skipped: false };
    }
  }
}
