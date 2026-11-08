import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { streamFlowReading, organisation, organisationState, eq, and, isNull } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ImportBatchEntity,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { StreamFlowRepository } from '../repositories/stream-flow.repository';
import { BlisPublicService } from '../../blis/public';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class StreamFlowImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.stream_flow_reading';
  readonly version = 1;
  readonly permission = permissions.SLIS_STREAM_FLOW_RECORD;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.stream_flow_reading'];

  constructor(
    private readonly streamFlowRepo: StreamFlowRepository,
    private readonly blisPublicService: BlisPublicService,
  ) {}

  getExampleRow(): Record<string, unknown> {
    return {
      schemeCode: 'KRIS',
      stationId: '018f3a5e-9000-7000-8000-000000000001',
      readAt: '2026-03-15T08:00:00.000Z',
      value: 45.125,
      unit: 'm3/s',
    };
  }

  async parseRow(
    rawRow: Record<string, unknown>,
    _ctx: { batch: ImportBatchEntity; authz?: UserAuthz },
  ): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    if (_ctx.batch?.schemeId && !parsedData.schemeId) {
      parsedData.schemeId = _ctx.batch.schemeId;
    }
    if (_ctx.batch?.stateId && !parsedData.stateId) {
      parsedData.stateId = _ctx.batch.stateId;
    }

    const schemeCode = rawData.schemeCode ? String(rawData.schemeCode).trim().toUpperCase() : null;
    if (schemeCode) {
      parsedData.schemeCode = schemeCode;
    }

    const stationId = String(rawData.stationId || '').trim();
    if (!stationId) {
      errors.push({
        column: 'stationId',
        message: 'Station ID is required',
        code: 'MISSING_STATION_ID',
      });
    } else {
      parsedData.stationId = stationId;
    }

    const readAt = String(rawData.readAt || '').trim();
    if (!readAt || isNaN(Date.parse(readAt))) {
      errors.push({
        column: 'readAt',
        message: 'Read at must be a valid ISO datetime string',
        code: 'INVALID_READ_AT',
      });
    } else {
      parsedData.readAt = readAt;
    }

    if (
      rawData.value === undefined ||
      rawData.value === null ||
      String(rawData.value).trim() === ''
    ) {
      errors.push({
        column: 'value',
        message: 'Flow rate value is required',
        code: 'MISSING_VALUE',
      });
    } else {
      const numVal = parseFloat(String(rawData.value));
      if (isNaN(numVal) || numVal < 0) {
        errors.push({
          column: 'value',
          message: 'Flow rate value must be a non-negative number',
          code: 'INVALID_VALUE',
        });
      } else {
        parsedData.value = numVal.toFixed(4);
      }
    }

    parsedData.unit = rawData.unit ? String(rawData.unit).trim() : 'm3/s';

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
    const data = row.parsedData;

    // Resolve scheme
    const schemeCode = data.schemeCode ? String(data.schemeCode).trim().toUpperCase() : null;
    let schemeId = schemeCode ? undefined : (data.schemeId as string | undefined);

    if (schemeCode) {
      const [foundScheme] = await tx
        .select({ id: organisation.id, stateId: organisationState.stateId })
        .from(organisation)
        .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
        .where(and(eq(organisation.code, schemeCode), isNull(organisation.deletedAt)))
        .limit(1);

      if (!foundScheme) {
        errors.push({
          column: 'schemeCode',
          message: `Referenced Scheme Code '${schemeCode}' does not exist`,
          code: 'SCHEME_NOT_FOUND',
        });
      } else {
        schemeId = foundScheme.id;
        data.schemeId = foundScheme.id;
        data.stateId = foundScheme.stateId;
      }
    } else if (schemeId && !data.stateId) {
      const [link] = await tx
        .select({ stateId: organisationState.stateId })
        .from(organisationState)
        .where(eq(organisationState.organisationId, schemeId))
        .limit(1);
      data.stateId = link?.stateId ?? null;
    }

    if (!schemeId) {
      errors.push({
        column: 'schemeId',
        message: 'Scheme could not be determined for this reading',
        code: 'MISSING_SCHEME',
      });
    }

    // Two-gate Scope Check (Gate 1: Validation)
    if (schemeId && !scope.isNational) {
      const rowStateId = data.stateId as string | null;
      const stateMatch = rowStateId && scope.stateIds?.includes(rowStateId);
      const schemeMatch = scope.schemeIds?.includes(schemeId);

      if (!stateMatch && !schemeMatch) {
        errors.push({
          column: 'schemeId',
          message: `Scheme ${schemeId} is outside your authorized scope`,
          code: 'OUT_OF_SCOPE',
        });
      }
    }

    // Station validation via BLIS public service
    const stationId = data.stationId as string;
    if (stationId) {
      const stationValidation = await this.blisPublicService.validateStation(stationId);
      if (!stationValidation.valid) {
        if (stationValidation.reason === 'inactive') {
          errors.push({
            column: 'stationId',
            message: 'Station is inactive',
            code: 'STATION_INACTIVE',
          });
        } else {
          errors.push({
            column: 'stationId',
            message: 'Station does not exist',
            code: 'STATION_NOT_FOUND',
          });
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const scheme = String(parsedData.schemeCode || parsedData.schemeId || '');
    const station = String(parsedData.stationId || '');
    const readAt = String(parsedData.readAt || '');
    return `${scheme}#${station}#${readAt}`;
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
    const schemeId = (data.schemeId as string) || (data.organisationId as string);

    const created = await this.streamFlowRepo.create(
      {
        schemeId,
        stationId: String(data.stationId),
        readAt: String(data.readAt),
        value: String(data.value),
        unit: (data.unit as string) ?? 'm3/s',
        status: 'submitted',
        importBatchId: row.batchId,
        createdBy: authz.userId,
      },
      tx,
    );

    return { targetEntityId: created.id, beforeImage: null };
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
    await tx
      .update(streamFlowReading)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(streamFlowReading.id, row.targetEntityId));

    return {};
  }
}
