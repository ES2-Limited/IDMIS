import { Injectable } from '@nestjs/common';
import {
  permissions,
  WARD_IMPORT_DEFINITION,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { ward, lga, wua, eq, sql } from '@idmis/db';
import { generateDeterministicId } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from './import-handler.interface';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class WardImportHandler implements ImportDatasetHandler {
  readonly dataset = 'ward';
  readonly version = WARD_IMPORT_DEFINITION.version;
  readonly permission = permissions.CORE_ORGANISATION_MANAGE;
  readonly columns: ImportColumnDefinition[] = WARD_IMPORT_DEFINITION.columns;

  getExampleRow(): Record<string, unknown> {
    return {
      code: 'NG020001001',
      name: 'Ajingi Ward',
      lga_code: 'NG020001',
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const code = String(rawData.code || '')
      .trim()
      .toUpperCase();
    if (!code) {
      errors.push({ column: 'code', message: 'Ward Code is required' });
    } else {
      parsedData.code = code;
    }

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'Ward Name is required' });
    } else {
      parsedData.name = name;
    }

    const lgaCode = String(rawData.lga_code || rawData.lgaCode || '')
      .trim()
      .toUpperCase();
    if (!lgaCode) {
      errors.push({ column: 'lga_code', message: 'LGA Code is required' });
    } else {
      parsedData.lga_code = lgaCode;
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
    const lgaCode = String(row.parsedData.lga_code || '').toUpperCase();

    if (lgaCode) {
      const [foundLga] = await tx
        .select({ id: lga.id, code: lga.code, stateId: lga.stateId })
        .from(lga)
        .where(eq(sql`UPPER(${lga.code})`, lgaCode))
        .limit(1);

      if (!foundLga) {
        errors.push({
          column: 'lga_code',
          message: `Referenced LGA Code '${lgaCode}' does not exist`,
        });
      } else {
        row.parsedData.lgaId = foundLga.id;

        if (!scope.isNational) {
          const matchState = scope.stateIds?.includes(foundLga.stateId);
          if (!matchState) {
            errors.push({
              column: 'lga_code',
              message: 'Target location is outside your assigned scope',
              code: 'out_of_scope',
            });
          }
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    return String(parsedData.code || '')
      .trim()
      .toUpperCase();
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
    const code = String(data.code).trim().toUpperCase();
    const name = String(data.name).trim();
    const lgaId = data.lgaId as string;

    const [existing] = await tx.select().from(ward).where(eq(ward.code, code)).limit(1);

    let targetEntityId: string;
    let beforeImage: Record<string, unknown> | null = null;

    if (existing) {
      beforeImage = {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        lgaId: existing.lgaId,
      };

      await tx
        .update(ward)
        .set({
          name,
          lgaId,
        })
        .where(eq(ward.id, existing.id));

      targetEntityId = existing.id;
    } else {
      targetEntityId = generateDeterministicId('ward', code);

      await tx.insert(ward).values({
        id: targetEntityId,
        code,
        name,
        lgaId,
      });
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
    const [current] = await tx.select().from(ward).where(eq(ward.id, row.targetEntityId)).limit(1);

    if (!current) {
      return {
        skipped: true,
        reason: 'Record no longer exists or was already deleted',
      };
    }

    if (row.beforeImage) {
      const prev = row.beforeImage as Record<string, unknown>;
      await tx
        .update(ward)
        .set({
          name: prev.name as string,
          lgaId: prev.lgaId as string,
        })
        .where(eq(ward.id, row.targetEntityId));

      return { skipped: false };
    } else {
      const [childWua] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(eq(wua.wardId, row.targetEntityId))
        .limit(1);

      if (childWua) {
        return {
          skipped: true,
          reason: 'Ward cannot be undone because existing WUAs reference it',
        };
      }

      await tx.delete(ward).where(eq(ward.id, row.targetEntityId));
      return { skipped: false };
    }
  }
}
