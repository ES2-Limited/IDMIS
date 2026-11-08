import { Injectable } from '@nestjs/common';
import {
  permissions,
  BLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { dam, basin, reservoir, lookupValue, lookupType, eq, and, isNull } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { BlisAssetService } from '../services/blis-asset.service';
import { isRbdaInScope } from '../utils/assert-blis-scope';
import { parseWktToGeoJson } from './wkt.helper';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class DamImportHandler implements ImportDatasetHandler {
  readonly dataset = 'blis.dam';
  readonly version = 1;
  readonly permission = permissions.BLIS_DAM_MANAGE;
  readonly columns: ImportColumnDefinition[] = BLIS_IMPORT_TEMPLATES['blis.dam'];

  constructor(private readonly assetService: BlisAssetService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      name: 'Tiga Dam',
      basinCode: 'HJRB',
      reservoirName: 'Tiga Reservoir',
      damPurposeCode: 'irrigation',
      damCategoryCode: 'major',
      hazardClassCode: 'high',
      yearCompleted: 1974,
      crestLengthM: '6000.00',
      heightM: '48.00',
      storageCapacityMcm: '1874.00',
      geomWkt: 'POINT(8.60 11.45)',
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'Dam name is required' });
    } else {
      parsedData.name = name;
    }

    const basinCode = String(rawData.basinCode || '')
      .trim()
      .toUpperCase();
    if (!basinCode) {
      errors.push({ column: 'basinCode', message: 'Basin code is required' });
    } else {
      parsedData.basinCode = basinCode;
    }

    if (rawData.reservoirName) {
      parsedData.reservoirName = String(rawData.reservoirName).trim();
    }

    if (rawData.damPurposeCode) {
      parsedData.damPurposeCode = String(rawData.damPurposeCode).trim().toLowerCase();
    }

    if (rawData.damCategoryCode) {
      parsedData.damCategoryCode = String(rawData.damCategoryCode).trim().toLowerCase();
    }

    if (rawData.hazardClassCode) {
      parsedData.hazardClassCode = String(rawData.hazardClassCode).trim().toLowerCase();
    }

    if (rawData.yearCompleted) {
      const year = Number(rawData.yearCompleted);
      if (isNaN(year) || year < 1800 || year > 2100) {
        errors.push({
          column: 'yearCompleted',
          message: 'Year completed must be between 1800 and 2100',
        });
      } else {
        parsedData.yearCompleted = year;
      }
    }

    if (rawData.crestLengthM) parsedData.crestLengthM = String(rawData.crestLengthM).trim();
    if (rawData.heightM) parsedData.heightM = String(rawData.heightM).trim();
    if (rawData.storageCapacityMcm)
      parsedData.storageCapacityMcm = String(rawData.storageCapacityMcm).trim();

    if (rawData.geomWkt) {
      const parsedGeom = parseWktToGeoJson(String(rawData.geomWkt));
      parsedData.geom = parsedGeom ?? String(rawData.geomWkt).trim();
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
    const basinCode = parsedData.basinCode as string;
    const damPurposeCode = parsedData.damPurposeCode as string | undefined;
    const damCategoryCode = parsedData.damCategoryCode as string | undefined;
    const reservoirName = parsedData.reservoirName as string | undefined;

    // 1. Resolve basin
    const [b] = await tx
      .select({ id: basin.id, rbdaId: basin.rbdaId })
      .from(basin)
      .where(and(eq(basin.code, basinCode), isNull(basin.deletedAt)))
      .limit(1);

    if (!b) {
      errors.push({
        column: 'basinCode',
        message: `Basin with code '${basinCode}' not found`,
        code: 'not_found',
      });
      return errors;
    }
    parsedData.basinId = b.id;
    parsedData.rbdaId = b.rbdaId;

    // Check RBDA scope
    if (!isRbdaInScope(scope, b.rbdaId)) {
      errors.push({
        column: 'basinCode',
        message: 'Basin is outside your assigned RBDA scope',
        code: 'out_of_scope',
      });
      return errors;
    }

    // 2. Resolve dam_purpose (optional)
    if (damPurposeCode) {
      const [pLookup] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .innerJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
        .where(
          and(
            eq(lookupType.key, 'dam_purpose'),
            eq(lookupValue.code, damPurposeCode),
            eq(lookupValue.isActive, true),
          ),
        )
        .limit(1);

      if (!pLookup) {
        errors.push({
          column: 'damPurposeCode',
          message: `Dam purpose '${damPurposeCode}' not found`,
          code: 'not_found',
        });
      } else {
        parsedData.purposeId = pLookup.id;
      }
    }

    // 3. Resolve dam_category (optional)
    if (damCategoryCode) {
      const [cLookup] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .innerJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
        .where(
          and(
            eq(lookupType.key, 'dam_category'),
            eq(lookupValue.code, damCategoryCode),
            eq(lookupValue.isActive, true),
          ),
        )
        .limit(1);

      if (!cLookup) {
        errors.push({
          column: 'damCategoryCode',
          message: `Dam category '${damCategoryCode}' not found`,
          code: 'not_found',
        });
      } else {
        parsedData.categoryId = cLookup.id;
      }
    }

    // 4. Resolve reservoir (optional)
    if (reservoirName) {
      const [res] = await tx
        .select({ id: reservoir.id })
        .from(reservoir)
        .where(
          and(
            eq(reservoir.name, reservoirName),
            eq(reservoir.basinId, b.id),
            isNull(reservoir.deletedAt),
          ),
        )
        .limit(1);

      if (res) {
        parsedData.reservoirId = res.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>, rawData: Record<string, unknown>): string {
    const basinCode = String(parsedData.basinCode || rawData.basinCode || '')
      .trim()
      .toUpperCase();
    const name = String(parsedData.name || rawData.name || '').trim();
    return `${basinCode}#${name}`;
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
      throw new Error('Basin is outside your assigned RBDA scope');
    }

    // If reservoirName provided and doesn't exist, create it
    let reservoirId = parsedData.reservoirId as string | undefined;
    if (!reservoirId && parsedData.reservoirName) {
      const res = await this.assetService.createReservoir(
        {
          name: parsedData.reservoirName as string,
          basinId: parsedData.basinId as string,
        },
        authz,
        authz.userId,
      );
      if (!res) {
        throw new Error('Failed to create reservoir');
      }
      reservoirId = res.id;
    }

    const created = await this.assetService.createDam(
      {
        name: parsedData.name as string,
        basinId: parsedData.basinId as string,
        reservoirId,
        purposeId: (parsedData.purposeId as string) || undefined,
        categoryId: (parsedData.categoryId as string) || undefined,
        completionYear: (parsedData.yearCompleted as number) || undefined,
        crestLengthM: (parsedData.crestLengthM as string) || undefined,
        heightM: (parsedData.heightM as string) || undefined,
        reservoirCapacityMcm: (parsedData.storageCapacityMcm as string) || undefined,
        geom: parsedData.geom as Record<string, unknown> | undefined,
      },
      authz,
      authz.userId,
    );

    if (!created) {
      throw new Error('Failed to create dam');
    }

    await tx.update(dam).set({ importBatchId: row.batchId }).where(eq(dam.id, created.id));

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
      .select({ id: dam.id, version: dam.version })
      .from(dam)
      .where(and(eq(dam.id, row.targetEntityId), isNull(dam.deletedAt)))
      .limit(1);

    if (existing) {
      await this.assetService.deleteDam(existing.id, existing.version, authz, authz.userId);
      return { skipped: false };
    }

    return {
      skipped: true,
      reason: 'Dam no longer exists or was already deleted',
    };
  }
}
