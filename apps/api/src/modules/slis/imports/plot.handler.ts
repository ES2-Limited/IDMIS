import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  plot,
  plotAllocation,
  farmer,
  season,
  organisation,
  organisationState,
  ward,
  lookupValue,
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
import { PlotService } from '../services/plot.service';
import { PlotAllocationService } from '../services/plot-allocation.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class PlotImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.plot';
  readonly version = 1;
  readonly permission = permissions.SLIS_PLOT_MANAGE;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.plot'];

  constructor(
    private readonly plotService: PlotService,
    private readonly plotAllocationService: PlotAllocationService,
  ) {}

  getExampleRow(): Record<string, unknown> {
    return {
      plotCode: 'P-SEC1-042',
      sectorCode: 'SEC-A',
      irrigationTypeKey: 'gravity',
      serviceType: 'improved',
      wardCode: 'KDW-01',
      areaHa: '1.2500',
      wktGeometry: 'POLYGON((8.50 11.80, 8.51 11.80, 8.51 11.81, 8.50 11.81, 8.50 11.80))',
      farmerCode: 'KRIS-SEC1-001',
      seasonName: 'Dry Season 2026',
      tenureKey: 'owner',
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

    const sectorCode = String(rawData.sectorCode || '')
      .trim()
      .toUpperCase();
    if (!sectorCode) {
      errors.push({ column: 'sectorCode', message: 'Sector code is required' });
    } else {
      parsedData.sectorCode = sectorCode;
    }

    if (
      rawData.areaHa !== undefined &&
      rawData.areaHa !== null &&
      String(rawData.areaHa).trim() !== ''
    ) {
      const area = parseFloat(String(rawData.areaHa));
      if (isNaN(area) || area <= 0) {
        errors.push({ column: 'areaHa', message: 'Area (ha) must be a positive number' });
      } else {
        parsedData.areaHa = area.toFixed(4);
      }
    }

    if (rawData.serviceType) {
      const serviceType = String(rawData.serviceType).trim().toLowerCase();
      if (!['new', 'improved', 'none'].includes(serviceType)) {
        errors.push({
          column: 'serviceType',
          message: "Service type must be 'new', 'improved', or 'none'",
        });
      } else {
        parsedData.serviceType = serviceType;
      }
    }

    // Geometry validation: accept WKT or GeoJSON; invalid geometry -> row error
    const geomRaw = rawData.wktGeometry || rawData.geometry || rawData.geom;
    if (geomRaw !== undefined && geomRaw !== null && String(geomRaw).trim() !== '') {
      const geomStr = String(geomRaw).trim();
      let isValid = false;

      if (geomStr.startsWith('{')) {
        try {
          const parsed = JSON.parse(geomStr);
          if (
            parsed &&
            typeof parsed === 'object' &&
            ['Polygon', 'MultiPolygon', 'Point'].includes(parsed.type) &&
            Array.isArray(parsed.coordinates)
          ) {
            isValid = true;
            parsedData.geom = parsed;
          }
        } catch {
          isValid = false;
        }
      } else if (/^(POLYGON|MULTIPOLYGON|POINT)\s*\(.*\)$/i.test(geomStr)) {
        isValid = true;
        parsedData.geom = geomStr;
      }

      if (!isValid) {
        errors.push({
          column: 'wktGeometry',
          message: 'Invalid plot boundary geometry: must be valid WKT or GeoJSON',
          code: 'invalid_geometry',
        });
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

    // Resolve sector
    if (data.sectorCode && schemeId) {
      const sectorCode = String(data.sectorCode).trim().toUpperCase();
      const [foundSector] = await tx
        .select({ id: organisation.id })
        .from(organisation)
        .where(
          and(
            eq(organisation.parentId, schemeId),
            eq(organisation.code, sectorCode),
            isNull(organisation.deletedAt),
          ),
        )
        .limit(1);

      if (!foundSector) {
        errors.push({
          column: 'sectorCode',
          message: `Referenced Sector Code '${sectorCode}' does not exist in scheme`,
        });
      } else {
        data.sectorId = foundSector.id;
      }
    }

    // Resolve ward
    if (data.wardCode) {
      const wardCode = String(data.wardCode).trim().toUpperCase();
      const [foundWard] = await tx
        .select({ id: ward.id })
        .from(ward)
        .where(eq(ward.code, wardCode))
        .limit(1);

      if (foundWard) {
        data.wardId = foundWard.id;
      }
    }

    // Resolve allocated farmer if given
    if (data.farmerCode && schemeId) {
      const farmerCode = String(data.farmerCode).trim();
      const [foundFarmer] = await tx
        .select({ id: farmer.id })
        .from(farmer)
        .where(
          and(
            eq(farmer.schemeId, schemeId),
            eq(farmer.farmerCode, farmerCode),
            isNull(farmer.deletedAt),
          ),
        )
        .limit(1);

      if (!foundFarmer) {
        errors.push({
          column: 'farmerCode',
          message: `Referenced Farmer Code '${farmerCode}' does not exist in scheme`,
        });
      } else {
        data.farmerId = foundFarmer.id;
      }
    }

    // Resolve season if given
    if (data.seasonName && schemeId) {
      const seasonName = String(data.seasonName).trim();
      const [foundSeason] = await tx
        .select({ id: season.id })
        .from(season)
        .where(
          and(eq(season.schemeId, schemeId), eq(season.name, seasonName), isNull(season.deletedAt)),
        )
        .limit(1);

      if (foundSeason) {
        data.seasonId = foundSeason.id;
      }
    }

    // Resolve tenure if given
    if (data.tenureKey) {
      const tenureKey = String(data.tenureKey).trim();
      const [foundTenure] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .where(eq(lookupValue.code, tenureKey))
        .limit(1);

      if (foundTenure) {
        data.tenureId = foundTenure.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || parsedData.schemeId || '').toUpperCase();
    const plotCode = String(parsedData.plotCode || '').trim();
    return `${schemeCode}#${plotCode}`;
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

    // Irrigation type lookup if specified
    let irrigationTypeId: string | undefined;
    if (data.irrigationTypeKey) {
      const [it] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .where(eq(lookupValue.code, String(data.irrigationTypeKey).trim()))
        .limit(1);
      irrigationTypeId = it?.id;
    }

    const createdPlot = await this.plotService.createPlot(
      {
        schemeId,
        sectorId: data.sectorId as string,
        plotCode: String(data.plotCode),
        areaHa: data.areaHa ? String(data.areaHa) : undefined,
        irrigationTypeId,
        serviceType: data.serviceType as 'new' | 'improved' | 'none' | undefined,
        wardId: (data.wardId as string) || undefined,
        geom: data.geom ?? undefined,
        status: 'submitted',
        importBatchId: row.batchId,
        submittedBy: authz.userId,
        submittedAt: new Date().toISOString(),
      } as Parameters<typeof this.plotService.createPlot>[0],
      authz,
      authz.userId,
    );

    // Initial plot allocation if farmer was allocated
    if (data.farmerId) {
      await this.plotAllocationService.createAllocation(
        {
          plotId: createdPlot.id,
          farmerId: data.farmerId as string,
          seasonId: (data.seasonId as string) || undefined,
          tenureId: (data.tenureId as string) || undefined,
          status: 'submitted',
          importBatchId: row.batchId,
          submittedBy: authz.userId,
          submittedAt: new Date().toISOString(),
        } as Parameters<typeof this.plotAllocationService.createAllocation>[0],
        authz,
        authz.userId,
      );
    }

    return { targetEntityId: createdPlot.id, beforeImage: null };
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
      .from(plot)
      .where(and(eq(plot.id, row.targetEntityId), isNull(plot.deletedAt)))
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

    // Soft delete initial allocations for this plot
    await tx
      .update(plotAllocation)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(plotAllocation.plotId, row.targetEntityId));

    // Soft delete plot
    await tx
      .update(plot)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(plot.id, row.targetEntityId));

    return { skipped: false };
  }
}
