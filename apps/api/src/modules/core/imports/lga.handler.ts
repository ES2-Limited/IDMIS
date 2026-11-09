import { Injectable } from '@nestjs/common';
import {
  permissions,
  LGA_IMPORT_DEFINITION,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { lga, state, ward, eq, sql } from '@idmis/db';
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
export class LgaImportHandler implements ImportDatasetHandler {
  readonly dataset = 'lga';
  readonly version = LGA_IMPORT_DEFINITION.version;
  readonly permission = permissions.CORE_ORGANISATION_MANAGE;
  readonly columns: ImportColumnDefinition[] = LGA_IMPORT_DEFINITION.columns;

  getExampleRow(): Record<string, unknown> {
    return {
      code: 'NG020001',
      name: 'Ajingi',
      state_code: 'KN',
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
      errors.push({ column: 'code', message: 'LGA Code is required' });
    } else {
      parsedData.code = code;
    }

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'LGA Name is required' });
    } else {
      parsedData.name = name;
    }

    const stateCode = String(rawData.state_code || rawData.stateCode || '')
      .trim()
      .toUpperCase();
    if (!stateCode) {
      errors.push({ column: 'state_code', message: 'State Code is required' });
    } else {
      parsedData.state_code = stateCode;
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
    const stateCode = String(row.parsedData.state_code || '').toUpperCase();

    if (stateCode) {
      const [foundState] = await tx
        .select({ id: state.id, code: state.code, name: state.name })
        .from(state)
        .where(eq(sql`UPPER(${state.code})`, stateCode))
        .limit(1);

      if (!foundState) {
        errors.push({
          column: 'state_code',
          message: `Referenced State Code '${stateCode}' does not exist`,
        });
      } else {
        row.parsedData.stateId = foundState.id;

        if (!scope.isNational) {
          const matchState = scope.stateIds?.includes(foundState.id);
          if (!matchState) {
            errors.push({
              column: 'state_code',
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
    const stateId = data.stateId as string;

    const [existing] = await tx.select().from(lga).where(eq(lga.code, code)).limit(1);

    let targetEntityId: string;
    let beforeImage: Record<string, unknown> | null = null;

    if (existing) {
      beforeImage = {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        stateId: existing.stateId,
      };

      await tx
        .update(lga)
        .set({
          name,
          stateId,
        })
        .where(eq(lga.id, existing.id));

      targetEntityId = existing.id;
    } else {
      targetEntityId = generateDeterministicId('lga', code);

      await tx.insert(lga).values({
        id: targetEntityId,
        code,
        name,
        stateId,
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
    const [current] = await tx.select().from(lga).where(eq(lga.id, row.targetEntityId)).limit(1);

    if (!current) {
      return {
        skipped: true,
        reason: 'Record no longer exists or was already deleted',
      };
    }

    if (row.beforeImage) {
      const prev = row.beforeImage as Record<string, unknown>;
      await tx
        .update(lga)
        .set({
          name: prev.name as string,
          stateId: prev.stateId as string,
        })
        .where(eq(lga.id, row.targetEntityId));

      return { skipped: false };
    } else {
      const [childWard] = await tx
        .select({ id: ward.id })
        .from(ward)
        .where(eq(ward.lgaId, row.targetEntityId))
        .limit(1);

      if (childWard) {
        return {
          skipped: true,
          reason: 'LGA cannot be undone because child wards reference it',
        };
      }

      await tx.delete(lga).where(eq(lga.id, row.targetEntityId));
      return { skipped: false };
    }
  }
}
