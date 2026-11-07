import { Injectable } from '@nestjs/common';
import {
  permissions,
  BLIS_IMPORT_TEMPLATES,
  convertUnit,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { station, basin, parameter, measurement, eq, and, isNull, sql } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { isRbdaInScope } from '../utils/assert-blis-scope';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';
import crypto from 'node:crypto';

@Injectable()
export class MeasurementImportHandler implements ImportDatasetHandler {
  readonly dataset = 'blis.measurement';
  readonly version = 1;
  readonly permission = permissions.BLIS_MEASUREMENT_IMPORT;
  readonly columns: ImportColumnDefinition[] = BLIS_IMPORT_TEMPLATES['blis.measurement'];
  readonly isAsyncCommit = true;

  getExampleRow(): Record<string, unknown> {
    return {
      stationCode: 'ST-001',
      parameterCode: 'WL',
      observedAt: '2026-03-15T12:00:00Z',
      value: '14.2500',
      unit: 'm',
      quality: 'raw',
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const stationCode = String(rawData.stationCode || '')
      .trim()
      .toUpperCase();
    if (!stationCode) {
      errors.push({ column: 'stationCode', message: 'Station code is required' });
    } else {
      parsedData.stationCode = stationCode;
    }

    const parameterCode = String(rawData.parameterCode || '')
      .trim()
      .toUpperCase();
    if (!parameterCode) {
      errors.push({ column: 'parameterCode', message: 'Parameter code is required' });
    } else {
      parsedData.parameterCode = parameterCode;
    }

    const observedAtStr = String(rawData.observedAt || '').trim();
    if (!observedAtStr) {
      errors.push({ column: 'observedAt', message: 'Observed at timestamp is required' });
    } else {
      const parsedTime = Date.parse(observedAtStr);
      if (isNaN(parsedTime)) {
        errors.push({
          column: 'observedAt',
          message: 'Observed at must be a valid ISO datetime with timezone',
        });
      } else {
        parsedData.observedAt = new Date(parsedTime).toISOString();
      }
    }

    const valueStr = String(rawData.value ?? '').trim();
    if (!valueStr) {
      errors.push({ column: 'value', message: 'Value is required' });
    } else if (!/^-?\d+(\.\d+)?$/.test(valueStr)) {
      errors.push({ column: 'value', message: 'Value must be a valid decimal number string' });
    } else {
      parsedData.value = valueStr;
    }

    const unitStr = String(rawData.unit || '').trim();
    if (!unitStr) {
      errors.push({ column: 'unit', message: 'Unit is required' });
    } else {
      parsedData.unit = unitStr;
    }

    const qualityStr = String(rawData.quality || 'raw')
      .trim()
      .toLowerCase();
    if (!['raw', 'checked', 'suspect'].includes(qualityStr)) {
      errors.push({
        column: 'quality',
        message: "Quality must be 'raw', 'checked', or 'suspect'",
      });
    } else {
      parsedData.quality = qualityStr;
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
    const stationCode = parsedData.stationCode as string;
    const parameterCode = parsedData.parameterCode as string;
    const unit = parsedData.unit as string;
    const value = parsedData.value as string;

    // 1. Resolve station & check scope
    if (stationCode) {
      const [st] = await tx
        .select({
          id: station.id,
          basinId: station.basinId,
          rbdaId: basin.rbdaId,
        })
        .from(station)
        .innerJoin(basin, eq(station.basinId, basin.id))
        .where(and(eq(station.code, stationCode), isNull(station.deletedAt)))
        .limit(1);

      if (!st) {
        errors.push({
          column: 'stationCode',
          message: `Station with code '${stationCode}' not found`,
          code: 'not_found',
        });
      } else {
        parsedData.stationId = st.id;
        parsedData.rbdaId = st.rbdaId;

        // Verify RBDA scope
        if (!isRbdaInScope(scope, st.rbdaId)) {
          errors.push({
            column: 'stationCode',
            message: `Station '${stationCode}' is outside your assigned RBDA scope`,
            code: 'out_of_scope',
          });
        }
      }
    }

    // 2. Resolve parameter and validate unit / conversion
    if (parameterCode) {
      const [param] = await tx
        .select({
          id: parameter.id,
          defaultUnit: parameter.defaultUnit,
        })
        .from(parameter)
        .where(eq(parameter.code, parameterCode))
        .limit(1);

      if (!param) {
        errors.push({
          column: 'parameterCode',
          message: `Parameter with code '${parameterCode}' not found`,
          code: 'not_found',
        });
      } else {
        parsedData.parameterId = param.id;

        if (unit && value) {
          const converted = convertUnit(value, unit, param.defaultUnit);
          if (!converted) {
            errors.push({
              column: 'unit',
              message: `Unit '${unit}' does not match parameter default '${param.defaultUnit}' and has no supported conversion`,
              code: 'invalid_unit',
            });
          } else {
            parsedData.value = converted.value;
            parsedData.unit = converted.unit;
          }
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>, rawData: Record<string, unknown>): string {
    const s = String(parsedData.stationCode || rawData.stationCode || '').trim();
    const p = String(parsedData.parameterCode || rawData.parameterCode || '').trim();
    const t = String(parsedData.observedAt || rawData.observedAt || '').trim();
    return `${s}::${p}::${t}`;
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

    if (!isRbdaInScope(scope, (parsedData.rbdaId as string | null) ?? null)) {
      throw new Error('Station is outside your assigned RBDA scope');
    }

    const obsDate = new Date(parsedData.observedAt as string);
    const yr = obsDate.getUTCFullYear();
    await tx.execute(sql`SELECT blis.ensure_measurement_partition(${yr});`);

    const measurementId = crypto.randomUUID();

    await tx.execute(sql`
      INSERT INTO blis.measurement (
        id, station_id, parameter_id, observed_at, value, unit, quality, source, import_batch_id, created_by
      )
      VALUES (
        ${measurementId}::uuid,
        ${parsedData.stationId as string}::uuid,
        ${parsedData.parameterId as string}::uuid,
        ${parsedData.observedAt as string}::timestamptz,
        ${parsedData.value as string}::numeric,
        ${parsedData.unit as string},
        ${(parsedData.quality as string) || 'raw'},
        'import',
        ${row.batchId}::uuid,
        ${authz.userId}::uuid
      )
      ON CONFLICT (station_id, parameter_id, observed_at) DO UPDATE SET
        value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        quality = EXCLUDED.quality,
        source = 'import',
        import_batch_id = EXCLUDED.import_batch_id;
    `);

    return {
      targetEntityId: measurementId,
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
    _authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult> {
    await tx.delete(measurement).where(eq(measurement.id, row.targetEntityId));
    return { skipped: false };
  }

  async undoBatch(batchId: string, _authz: UserAuthz, tx: TransactionClient): Promise<void> {
    await tx.execute(sql`
      DELETE FROM blis.measurement WHERE import_batch_id = ${batchId}::uuid;
    `);
    await tx.execute(sql`
      SELECT blis.refresh_mv_latest_reading();
    `);
  }
}
