import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  waterRequest,
  season,
  farmer,
  wua,
  organisation,
  organisationState,
  eq,
  and,
  isNull,
} from '@idmis/db';
import type {
  ImportDatasetHandler,
  ImportBatchEntity,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { WaterRequestService } from '../services/water-request.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class WaterRequestImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.water_request';
  readonly version = 1;
  readonly permission = permissions.SLIS_WATER_REQUEST_CREATE;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.water_request'];

  constructor(private readonly waterRequestService: WaterRequestService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      level: 'individual',
      targetCode: 'KRIS-SEC1-001',
      seasonName: 'Dry Season 2026',
      volumeM3: '2500.00',
      periodFromOn: '2026-02-01',
      periodToOn: '2026-02-28',
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

    const level = String(rawData.level || '')
      .trim()
      .toLowerCase();
    if (!['apex', 'sector', 'unit', 'individual'].includes(level)) {
      errors.push({
        column: 'level',
        message: "Request level must be 'apex', 'sector', 'unit', or 'individual'",
      });
    } else {
      parsedData.level = level;
    }

    const targetCode = String(rawData.targetCode || '').trim();
    if (!targetCode) {
      errors.push({ column: 'targetCode', message: 'Target code is required' });
    } else {
      parsedData.targetCode = targetCode;
    }

    const seasonName = String(rawData.seasonName || '').trim();
    if (!seasonName) {
      errors.push({ column: 'seasonName', message: 'Season name is required' });
    } else {
      parsedData.seasonName = seasonName;
    }

    if (
      rawData.volumeM3 !== undefined &&
      rawData.volumeM3 !== null &&
      String(rawData.volumeM3).trim() !== ''
    ) {
      const vol = parseFloat(String(rawData.volumeM3));
      if (isNaN(vol) || vol <= 0) {
        errors.push({ column: 'volumeM3', message: 'Volume must be a positive number' });
      } else {
        parsedData.volumeM3 = vol.toFixed(2);
      }
    }

    if (rawData.periodFromOn) {
      parsedData.periodFromOn = String(rawData.periodFromOn).trim();
    }
    if (rawData.periodToOn) {
      parsedData.periodToOn = String(rawData.periodToOn).trim();
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

    // Two-gate Scope Check (Gate 1: Validation)
    if (schemeId && !scope.isNational) {
      const rowStateId = data.stateId as string | null;
      const stateMatch = rowStateId && scope.stateIds?.includes(rowStateId);
      const schemeMatch = scope.schemeIds?.includes(schemeId);
      if (!stateMatch && !schemeMatch) {
        errors.push({
          column: 'schemeCode',
          message: 'Target location is outside your assigned scope',
          code: 'out_of_scope',
        });
      }
    }

    // Resolve season
    if (data.seasonName && schemeId) {
      const seasonName = String(data.seasonName).trim();
      const [foundSeason] = await tx
        .select({ id: season.id })
        .from(season)
        .where(
          and(eq(season.schemeId, schemeId), eq(season.name, seasonName), isNull(season.deletedAt)),
        )
        .limit(1);

      if (!foundSeason) {
        errors.push({
          column: 'seasonName',
          message: `Referenced Season '${seasonName}' does not exist in scheme`,
        });
      } else {
        data.seasonId = foundSeason.id;
      }
    }

    // Resolve target (farmer for individual, WUA otherwise)
    if (data.level === 'individual' && schemeId) {
      const targetCode = String(data.targetCode).trim();
      const [f] = await tx
        .select({ id: farmer.id })
        .from(farmer)
        .where(
          and(
            eq(farmer.schemeId, schemeId),
            eq(farmer.farmerCode, targetCode),
            isNull(farmer.deletedAt),
          ),
        )
        .limit(1);

      if (!f) {
        errors.push({
          column: 'targetCode',
          message: `Referenced Farmer Code '${targetCode}' does not exist in scheme`,
        });
      } else {
        data.farmerId = f.id;
      }
    } else if (data.level !== 'individual' && schemeId) {
      const regNo = String(data.targetCode).trim();
      const [w] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(and(eq(wua.organisationId, schemeId), eq(wua.regNo, regNo), isNull(wua.deletedAt)))
        .limit(1);

      if (!w) {
        errors.push({
          column: 'targetCode',
          message: `Referenced WUA Registration Number '${regNo}' does not exist in scheme`,
        });
      } else {
        data.wuaId = w.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || parsedData.schemeId || '').toUpperCase();
    const seasonName = String(parsedData.seasonName || parsedData.seasonId || '').trim();
    const level = String(parsedData.level || '').trim();
    const targetCode = String(parsedData.targetCode || '').trim();
    return `${schemeCode}#${seasonName}#${level}#${targetCode}`;
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
  ): Promise<CommitRowResult> {
    const data = row.parsedData;
    const schemeId = (data.schemeId as string) || (data.organisationId as string);

    const created = await this.waterRequestService.createWaterRequest(
      {
        schemeId,
        level: data.level as 'apex' | 'sector' | 'unit' | 'individual',
        farmerId: (data.farmerId as string) || undefined,
        wuaId: (data.wuaId as string) || undefined,
        seasonId: (data.seasonId as string) || undefined,
        volumeM3: data.volumeM3 ? String(data.volumeM3) : undefined,
        periodFromOn: (data.periodFromOn as string) || undefined,
        periodToOn: (data.periodToOn as string) || undefined,
        status: 'submitted',
        importBatchId: row.batchId,
        submittedBy: authz.userId,
        submittedAt: new Date().toISOString(),
      } as Parameters<typeof this.waterRequestService.createWaterRequest>[0],
      authz,
      authz.userId,
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
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult> {
    const [current] = await tx
      .select()
      .from(waterRequest)
      .where(and(eq(waterRequest.id, row.targetEntityId), isNull(waterRequest.deletedAt)))
      .limit(1);

    if (!current) {
      return { skipped: true, reason: 'Record no longer exists or was already deleted' };
    }

    if (current.decision !== 'pending') {
      return { skipped: true, reason: 'Water request has already been decided' };
    }

    if (current.version !== 1) {
      return {
        skipped: true,
        reason: 'Record version mismatch: record was modified after import (undo_skipped_modified)',
      };
    }

    // Soft delete water request
    await tx
      .update(waterRequest)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(waterRequest.id, row.targetEntityId));

    return { skipped: false };
  }
}
