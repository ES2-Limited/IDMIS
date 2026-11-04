import { Injectable } from '@nestjs/common';
import {
  permissions,
  BLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { station, basin, lookupValue, lookupType, ward, eq, and, isNull } from '@idmis/db';
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
export class StationImportHandler implements ImportDatasetHandler {
  readonly dataset = 'blis.station';
  readonly version = 1;
  readonly permission = permissions.BLIS_STATION_MANAGE;
  readonly columns: ImportColumnDefinition[] = BLIS_IMPORT_TEMPLATES['blis.station'];

  constructor(private readonly assetService: BlisAssetService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      code: 'ST-001',
      name: 'Wudil Gauge',
      basinCode: 'HJRB',
      stationTypeCode: 'discharge',
      wardCode: 'WARD-01',
      river: 'Hadejia',
      geomWkt: 'POINT(8.85 11.80)',
      altitudeM: '380.50',
      installedOn: '2020-01-15',
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
      errors.push({ column: 'code', message: 'Station code is required' });
    } else {
      parsedData.code = code;
    }

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'Station name is required' });
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

    const stationTypeCode = String(rawData.stationTypeCode || '')
      .trim()
      .toLowerCase();
    if (!stationTypeCode) {
      errors.push({ column: 'stationTypeCode', message: 'Station type code is required' });
    } else {
      parsedData.stationTypeCode = stationTypeCode;
    }

    if (rawData.wardCode) {
      parsedData.wardCode = String(rawData.wardCode).trim();
    }

    if (rawData.river) {
      parsedData.river = String(rawData.river).trim();
    }

    const geomWkt = String(rawData.geomWkt || '').trim();
    if (!geomWkt) {
      errors.push({ column: 'geomWkt', message: 'Geometry WKT is required' });
    } else {
      parsedData.geom = geomWkt;
    }

    if (rawData.altitudeM) {
      parsedData.altitudeM = String(rawData.altitudeM).trim();
    }

    if (rawData.installedOn) {
      const instDate = String(rawData.installedOn).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(instDate)) {
        errors.push({
          column: 'installedOn',
          message: 'Installed on date must be in YYYY-MM-DD format',
        });
      } else {
        parsedData.installedOn = instDate;
      }
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
    const stationTypeCode = parsedData.stationTypeCode as string;
    const wardCode = parsedData.wardCode as string | undefined;
    const code = parsedData.code as string;

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

    // 2. Resolve station_type lookup
    const [stLookup] = await tx
      .select({ id: lookupValue.id })
      .from(lookupValue)
      .innerJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
      .where(
        and(
          eq(lookupType.key, 'station_type'),
          eq(lookupValue.code, stationTypeCode),
          eq(lookupValue.isActive, true),
        ),
      )
      .limit(1);

    if (!stLookup) {
      errors.push({
        column: 'stationTypeCode',
        message: `Station type '${stationTypeCode}' not found`,
        code: 'not_found',
      });
    } else {
      parsedData.stationTypeId = stLookup.id;
    }

    // 3. Resolve ward (optional)
    if (wardCode) {
      const [w] = await tx
        .select({ id: ward.id })
        .from(ward)
        .where(eq(ward.code, wardCode))
        .limit(1);

      if (!w) {
        errors.push({
          column: 'wardCode',
          message: `Ward with code '${wardCode}' not found`,
          code: 'not_found',
        });
      } else {
        parsedData.wardId = w.id;
      }
    }

    // 4. Duplicate check
    if (code) {
      const [existing] = await tx
        .select({ id: station.id })
        .from(station)
        .where(and(eq(station.code, code), isNull(station.deletedAt)))
        .limit(1);

      if (existing) {
        errors.push({
          column: 'code',
          message: `Station with code '${code}' already exists`,
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
      throw new Error('Basin is outside your assigned RBDA scope');
    }

    const created = await this.assetService.createStation(
      {
        code: parsedData.code as string,
        name: parsedData.name as string,
        basinId: parsedData.basinId as string,
        stationTypeId: parsedData.stationTypeId as string,
        wardId: (parsedData.wardId as string) || undefined,
        river: (parsedData.river as string) || undefined,
        geom: parsedData.geom as string,
        installedOn: (parsedData.installedOn as string) || undefined,
        isActive: true,
      },
      authz,
      authz.userId,
    );

    if (!created) {
      throw new Error('Failed to create station');
    }

    await tx.update(station).set({ importBatchId: row.batchId }).where(eq(station.id, created.id));

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
      .select({ id: station.id, version: station.version })
      .from(station)
      .where(and(eq(station.id, row.targetEntityId), isNull(station.deletedAt)))
      .limit(1);

    if (existing) {
      await this.assetService.deleteStation(existing.id, existing.version, authz, authz.userId);
      return { skipped: false };
    }

    return {
      skipped: true,
      reason: 'Station no longer exists or was already deleted',
    };
  }
}
