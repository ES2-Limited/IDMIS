import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  feeBilling,
  feeCollection,
  season,
  farmer,
  wua,
  plot,
  plotAllocation,
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
import { FeeService } from '../services/fee.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class FeeBillingImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.fee_billing';
  readonly version = 1;
  readonly permission = permissions.SLIS_FEE_RECORD;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.fee_billing'];

  constructor(private readonly feeService: FeeService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      seasonName: 'Dry Season 2026',
      targetType: 'farmer',
      targetCode: 'KRIS-SEC1-001',
      plotCode: 'P-SEC1-042',
      amountNgn: '15000.00',
      dueDate: '2026-04-30',
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

    const seasonName = String(rawData.seasonName || '').trim();
    if (!seasonName) {
      errors.push({ column: 'seasonName', message: 'Season name is required' });
    } else {
      parsedData.seasonName = seasonName;
    }

    const targetType = String(rawData.targetType || '')
      .trim()
      .toLowerCase();
    if (!['wua', 'farmer'].includes(targetType)) {
      errors.push({
        column: 'targetType',
        message: "Target type must be either 'wua' or 'farmer'",
      });
    } else {
      parsedData.targetType = targetType;
    }

    const targetCode = String(rawData.targetCode || rawData.plotCode || '').trim();
    if (!targetCode) {
      errors.push({
        column: 'targetCode',
        message: 'Target code or plot code is required',
      });
    } else {
      parsedData.targetCode = targetCode;
    }

    if (rawData.plotCode) {
      parsedData.plotCode = String(rawData.plotCode).trim();
    }

    const amountStr = String(rawData.amountNgn || '').trim();
    const amountNum = parseFloat(amountStr);
    if (!amountStr || isNaN(amountNum) || amountNum <= 0) {
      errors.push({
        column: 'amountNgn',
        message: 'Amount NGN must be a positive decimal number',
      });
    } else {
      // Store exact decimal representation
      parsedData.amountNgn = amountNum.toFixed(2);
    }

    if (rawData.dueDate) {
      parsedData.dueDate = String(rawData.dueDate).trim();
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
        .select({ id: season.id, endsOn: season.endsOn })
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
        if (!data.dueDate) {
          data.dueDate = foundSeason.endsOn;
        }
      }
    }

    // Resolve target (farmer or wua)
    if (data.targetType === 'farmer' && schemeId) {
      let farmerFound = false;
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

      if (f) {
        data.farmerId = f.id;
        farmerFound = true;
      } else if (data.plotCode) {
        // Try resolving via plot allocation
        const [p] = await tx
          .select({ id: plot.id })
          .from(plot)
          .where(
            and(
              eq(plot.schemeId, schemeId),
              eq(plot.plotCode, String(data.plotCode).trim()),
              isNull(plot.deletedAt),
            ),
          )
          .limit(1);

        if (p) {
          const [alloc] = await tx
            .select({ farmerId: plotAllocation.farmerId })
            .from(plotAllocation)
            .where(and(eq(plotAllocation.plotId, p.id), isNull(plotAllocation.deletedAt)))
            .limit(1);

          if (alloc) {
            data.farmerId = alloc.farmerId;
            farmerFound = true;
          }
        }
      }

      if (!farmerFound) {
        errors.push({
          column: 'targetCode',
          message: `Referenced Farmer Code '${targetCode}' does not exist in scheme`,
        });
      }
    } else if (data.targetType === 'wua' && schemeId) {
      const regNo = String(data.targetCode).trim();
      const [foundWua] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(and(eq(wua.organisationId, schemeId), eq(wua.regNo, regNo), isNull(wua.deletedAt)))
        .limit(1);

      if (!foundWua) {
        errors.push({
          column: 'targetCode',
          message: `Referenced WUA Registration Number '${regNo}' does not exist in scheme`,
        });
      } else {
        data.wuaId = foundWua.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const target = String(parsedData.plotCode || parsedData.targetCode || '').trim();
    const seasonName = String(parsedData.seasonName || parsedData.seasonId || '').trim();
    return `${target}#${seasonName}`;
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

    // Fee rows are imported as historical/recorded (status: 'billed'), not 'submitted'
    const createdBilling = await this.feeService.createBilling(
      {
        schemeId,
        seasonId: data.seasonId as string,
        farmerId: (data.farmerId as string) || null,
        wuaId: (data.wuaId as string) || null,
        amountNgn: String(data.amountNgn),
        dueDate: String(data.dueDate),
        status: 'billed',
        importBatchId: row.batchId,
        createdBy: authz.userId,
      },
      authz,
      authz.userId,
    );

    return { targetEntityId: createdBilling.id, beforeImage: null };
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
      .from(feeBilling)
      .where(and(eq(feeBilling.id, row.targetEntityId), isNull(feeBilling.deletedAt)))
      .limit(1);

    if (!current) {
      return { skipped: true, reason: 'Record no longer exists or was already deleted' };
    }

    if (current.version !== 1) {
      return {
        skipped: true,
        reason: 'Record version mismatch: record was modified after import (undo_skipped_modified)',
      };
    }

    // Refuse undo if fee collections exist for this billing
    const [colRef] = await tx
      .select({ id: feeCollection.id })
      .from(feeCollection)
      .where(and(eq(feeCollection.billingId, row.targetEntityId), isNull(feeCollection.deletedAt)))
      .limit(1);

    if (colRef) {
      return {
        skipped: true,
        reason: 'Fee billing has dependent collections (undo refused)',
      };
    }

    // Soft delete fee billing
    await tx
      .update(feeBilling)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(feeBilling.id, row.targetEntityId));

    return { skipped: false };
  }
}
