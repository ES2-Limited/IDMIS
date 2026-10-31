import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  cropProduction,
  plot,
  season,
  lookupValue,
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
import { CropProductionService } from '../services/crop-production.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class CropProductionImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.crop_production';
  readonly version = 1;
  readonly permission = permissions.SLIS_CROP_MANAGE;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.crop_production'];

  constructor(private readonly cropService: CropProductionService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      plotCode: 'P-SEC1-042',
      seasonName: 'Dry Season 2026',
      cropTypeKey: 'rice',
      areaHa: '1.2500',
      yieldT: '4.500',
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

    const plotCode = String(rawData.plotCode || '').trim();
    if (!plotCode) {
      errors.push({ column: 'plotCode', message: 'Plot code is required' });
    } else {
      parsedData.plotCode = plotCode;
    }

    const seasonName = String(rawData.seasonName || '').trim();
    if (!seasonName) {
      errors.push({ column: 'seasonName', message: 'Season name is required' });
    } else {
      parsedData.seasonName = seasonName;
    }

    const cropTypeKey = String(rawData.cropTypeKey || '')
      .trim()
      .toLowerCase();
    if (!cropTypeKey) {
      errors.push({ column: 'cropTypeKey', message: 'Crop type key is required' });
    } else {
      parsedData.cropTypeKey = cropTypeKey;
    }

    const areaStr = String(rawData.areaHa || '').trim();
    const areaNum = parseFloat(areaStr);
    if (!areaStr || isNaN(areaNum) || areaNum <= 0) {
      errors.push({
        column: 'areaHa',
        message: 'Area (ha) must be a positive decimal number',
      });
    } else {
      parsedData.areaHa = areaNum.toFixed(4);
    }

    if (
      rawData.yieldT !== undefined &&
      rawData.yieldT !== null &&
      String(rawData.yieldT).trim() !== ''
    ) {
      const yieldNum = parseFloat(String(rawData.yieldT));
      if (isNaN(yieldNum) || yieldNum < 0) {
        errors.push({ column: 'yieldT', message: 'Yield must be a non-negative number' });
      } else {
        parsedData.yieldT = yieldNum.toFixed(3);
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

    // Resolve plot
    if (data.plotCode && schemeId) {
      const plotCode = String(data.plotCode).trim();
      const [foundPlot] = await tx
        .select({ id: plot.id })
        .from(plot)
        .where(
          and(eq(plot.schemeId, schemeId), eq(plot.plotCode, plotCode), isNull(plot.deletedAt)),
        )
        .limit(1);

      if (!foundPlot) {
        errors.push({
          column: 'plotCode',
          message: `Referenced Plot Code '${plotCode}' does not exist in scheme`,
        });
      } else {
        data.plotId = foundPlot.id;
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

    // Resolve crop type
    if (data.cropTypeKey) {
      const cropKey = String(data.cropTypeKey).trim();
      const [foundCrop] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .where(eq(lookupValue.code, cropKey))
        .limit(1);

      if (!foundCrop) {
        errors.push({
          column: 'cropTypeKey',
          message: `Referenced Crop Type Key '${cropKey}' does not exist`,
        });
      } else {
        data.cropTypeId = foundCrop.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const plotCode = String(parsedData.plotCode || '').trim();
    const seasonName = String(parsedData.seasonName || parsedData.seasonId || '').trim();
    const cropType = String(parsedData.cropTypeKey || parsedData.cropTypeId || '').trim();
    return `${plotCode}#${seasonName}#${cropType}`;
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

    const created = await this.cropService.createCropProduction(
      {
        schemeId,
        plotId: data.plotId as string,
        seasonId: data.seasonId as string,
        cropTypeId: data.cropTypeId as string,
        areaHa: String(data.areaHa),
        yieldT: data.yieldT ? String(data.yieldT) : undefined,
        status: 'submitted',
        importBatchId: row.batchId,
        submittedBy: authz.userId,
        submittedAt: new Date().toISOString(),
      } as Parameters<typeof this.cropService.createCropProduction>[0],
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
      .from(cropProduction)
      .where(and(eq(cropProduction.id, row.targetEntityId), isNull(cropProduction.deletedAt)))
      .limit(1);

    if (!current) {
      return { skipped: true, reason: 'Record no longer exists or was already deleted' };
    }

    if (current.status === 'approved') {
      return { skipped: true, reason: 'Record has already been approved' };
    }

    if (current.version !== 1) {
      return {
        skipped: true,
        reason: 'Record version mismatch: record was modified after import (undo_skipped_modified)',
      };
    }

    // Soft delete crop production
    await tx
      .update(cropProduction)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(cropProduction.id, row.targetEntityId));

    return { skipped: false };
  }
}
