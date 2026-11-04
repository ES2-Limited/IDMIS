import { Injectable } from '@nestjs/common';
import {
  permissions,
  BLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { basin, organisation, eq, and, isNull } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { BlisAssetService } from '../services/blis-asset.service';
import { isRbdaInScope } from '../utils/assert-blis-scope';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class BasinImportHandler implements ImportDatasetHandler {
  readonly dataset = 'blis.basin';
  readonly version = 1;
  readonly permission = permissions.BLIS_BASIN_MANAGE;
  readonly columns: ImportColumnDefinition[] = BLIS_IMPORT_TEMPLATES['blis.basin'];

  constructor(private readonly assetService: BlisAssetService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      code: 'HJRB',
      name: 'Hadejia-Jamaare',
      altName: 'HJ Basin',
      hydrologicalUnit: 'HU-8',
      mainRiver: 'Hadejia',
      rbdaCode: 'HJRBDA',
      geomWkt: 'MULTIPOLYGON(((8.5 11.5, 8.6 11.5, 8.6 11.6, 8.5 11.6, 8.5 11.5)))',
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
      errors.push({ column: 'code', message: 'Basin code is required' });
    } else {
      parsedData.code = code;
    }

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'Basin name is required' });
    } else {
      parsedData.name = name;
    }

    if (rawData.altName) parsedData.altName = String(rawData.altName).trim();
    if (rawData.hydrologicalUnit)
      parsedData.hydrologicalUnit = String(rawData.hydrologicalUnit).trim();
    if (rawData.mainRiver) parsedData.mainRiver = String(rawData.mainRiver).trim();

    if (rawData.rbdaCode) {
      parsedData.rbdaCode = String(rawData.rbdaCode).trim().toUpperCase();
    }

    if (rawData.geomWkt) {
      parsedData.geom = String(rawData.geomWkt).trim();
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
    const parsedData = row.parsedData;
    const code = parsedData.code as string;
    const rbdaCode = parsedData.rbdaCode as string | undefined;

    let rbdaId: string | null = null;
    if (rbdaCode) {
      const [rbdaOrg] = await tx
        .select({ id: organisation.id })
        .from(organisation)
        .where(
          and(
            eq(organisation.code, rbdaCode),
            eq(organisation.type, 'rbda'),
            isNull(organisation.deletedAt),
          ),
        )
        .limit(1);

      if (!rbdaOrg) {
        errors.push({
          column: 'rbdaCode',
          message: `RBDA with code '${rbdaCode}' not found`,
          code: 'not_found',
        });
        return errors;
      }
      rbdaId = rbdaOrg.id;
    }
    parsedData.rbdaId = rbdaId;

    // Check RBDA scope
    if (!isRbdaInScope(scope, rbdaId)) {
      errors.push({
        column: 'rbdaCode',
        message: 'RBDA is outside your assigned scope',
        code: 'out_of_scope',
      });
      return errors;
    }

    if (code) {
      const [existing] = await tx
        .select({ id: basin.id })
        .from(basin)
        .where(and(eq(basin.code, code), isNull(basin.deletedAt)))
        .limit(1);

      if (existing) {
        errors.push({
          column: 'code',
          message: `Basin with code '${code}' already exists`,
          code: 'duplicate',
        });
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>, rawData: Record<string, unknown>): string {
    return String(parsedData.code || rawData.code || '')
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
    const parsedData = row.parsedData;
    const scope = authz.scopeFor(this.permission);

    // Verify scope at commit time
    if (!isRbdaInScope(scope, parsedData.rbdaId as string | null)) {
      throw new Error('RBDA is outside your assigned scope');
    }

    const created = await this.assetService.createBasin(
      {
        code: parsedData.code as string,
        name: parsedData.name as string,
        altName: parsedData.altName as string | undefined,
        hydrologicalUnit: parsedData.hydrologicalUnit as string | undefined,
        mainRiver: parsedData.mainRiver as string | undefined,
        rbdaId: (parsedData.rbdaId as string) || undefined,
        geom: parsedData.geom as string | undefined,
      },
      authz,
      authz.userId,
    );

    if (!created) {
      throw new Error('Failed to create basin');
    }

    await tx.update(basin).set({ importBatchId: row.batchId }).where(eq(basin.id, created.id));

    return {
      targetEntityId: created.id,
      beforeImage: null,
    };
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
    const [existing] = await tx
      .select({ id: basin.id, version: basin.version })
      .from(basin)
      .where(and(eq(basin.id, row.targetEntityId), isNull(basin.deletedAt)))
      .limit(1);

    if (existing) {
      await this.assetService.deleteBasin(existing.id, existing.version, authz, authz.userId);
      return { skipped: false };
    }

    return {
      skipped: true,
      reason: 'Basin no longer exists or was already deleted',
    };
  }
}
