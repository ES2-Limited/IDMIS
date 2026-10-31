import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  feeCollection,
  feeBilling,
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
import { FeeService } from '../services/fee.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class FeeCollectionImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.fee_collection';
  readonly version = 1;
  readonly permission = permissions.SLIS_FEE_RECORD;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.fee_collection'];

  private readonly batchCollectedTotals = new Map<string, number>();

  constructor(private readonly feeService: FeeService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      seasonName: 'Dry Season 2026',
      targetType: 'farmer',
      targetCode: 'KRIS-SEC1-001',
      receiptNo: 'REC-2026-0001',
      amountNgn: '15000.00',
      paidOn: '2026-03-15',
      fieldReceiptRef: '',
    };
  }

  async parseRow(
    rawRow: Record<string, unknown>,
    _ctx: { batch: ImportBatchEntity; authz?: UserAuthz },
  ): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    if (_ctx.batch?.id && !parsedData.batchId) {
      parsedData.batchId = _ctx.batch.id;
    }
    if (_ctx.batch?.schemeId && !parsedData.schemeId) {
      parsedData.schemeId = _ctx.batch.schemeId;
    }
    if (_ctx.batch?.stateId && !parsedData.stateId) {
      parsedData.stateId = _ctx.batch.stateId;
    }

    const receiptNo = String(rawData.receiptNo || '').trim();
    if (!receiptNo) {
      errors.push({
        column: 'receiptNo',
        message: 'Receipt number is required for historic fee collections',
        code: 'RECEIPT_REQUIRED',
      });
    } else {
      parsedData.receiptNo = receiptNo;
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

    const targetCode = String(rawData.targetCode || '').trim();
    if (!targetCode) {
      errors.push({ column: 'targetCode', message: 'Target code is required' });
    } else {
      parsedData.targetCode = targetCode;
    }

    const amountStr = String(rawData.amountNgn || '').trim();
    const amountNum = parseFloat(amountStr);
    if (!amountStr || isNaN(amountNum) || amountNum <= 0) {
      errors.push({
        column: 'amountNgn',
        message: 'Amount NGN must be a positive decimal number',
      });
    } else {
      parsedData.amountNgn = amountNum.toFixed(2);
    }

    const paidOn = String(rawData.paidOn || '').trim();
    if (!paidOn) {
      errors.push({ column: 'paidOn', message: 'Payment date is required' });
    } else {
      parsedData.paidOn = paidOn;
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

    // Check duplicate receipt number vs DB
    if (data.receiptNo) {
      const receiptNo = String(data.receiptNo).trim();
      const [existingReceipt] = await tx
        .select({ id: feeCollection.id })
        .from(feeCollection)
        .where(and(eq(feeCollection.receiptNo, receiptNo), isNull(feeCollection.deletedAt)))
        .limit(1);

      if (existingReceipt) {
        errors.push({
          column: 'receiptNo',
          message: `Duplicate receipt number '${receiptNo}' already exists in database`,
          code: 'DUPLICATE_RECEIPT',
        });
      }
    }

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
    let seasonId: string | undefined;
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
        seasonId = foundSeason.id;
        data.seasonId = foundSeason.id;
      }
    }

    // Resolve target & matching billing row
    let farmerId: string | undefined;
    let wuaId: string | undefined;

    if (data.targetType === 'farmer' && schemeId) {
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
        farmerId = f.id;
        data.farmerId = f.id;
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
        wuaId = foundWua.id;
        data.wuaId = foundWua.id;
      }
    }

    // Must reference an existing fee_billing row
    if (schemeId && seasonId && (farmerId || wuaId)) {
      const billingQuery = farmerId
        ? and(
            eq(feeBilling.schemeId, schemeId),
            eq(feeBilling.seasonId, seasonId),
            eq(feeBilling.farmerId, farmerId),
            isNull(feeBilling.deletedAt),
          )
        : and(
            eq(feeBilling.schemeId, schemeId),
            eq(feeBilling.seasonId, seasonId),
            eq(feeBilling.wuaId, wuaId!),
            isNull(feeBilling.deletedAt),
          );

      const [billing] = await tx.select().from(feeBilling).where(billingQuery).limit(1);

      if (!billing) {
        errors.push({
          column: 'targetCode',
          message: 'No matching fee billing record found for this target and season',
          code: 'BILLING_NOT_FOUND',
        });
      } else {
        data.billingId = billing.id;

        // Check total collected per billing does not exceed billed amount
        const billedAmount = parseFloat(billing.amountNgn);
        const colAmount = parseFloat(String(data.amountNgn || '0'));

        const existingCollections = await tx
          .select({ amountNgn: feeCollection.amountNgn })
          .from(feeCollection)
          .where(and(eq(feeCollection.billingId, billing.id), isNull(feeCollection.deletedAt)));

        const dbCollected = existingCollections.reduce(
          (sum, c) => sum + parseFloat(c.amountNgn),
          0,
        );
        const batchKey = String(data.batchId || 'default');
        const mapKey = `${batchKey}:${billing.id}`;
        const priorBatchCollected = this.batchCollectedTotals.get(mapKey) || 0;
        const totalCollected = dbCollected + priorBatchCollected + colAmount;

        if (totalCollected > billedAmount) {
          errors.push({
            column: 'amountNgn',
            message: `Total collected amount (${totalCollected.toFixed(2)}) exceeds billed amount (${billedAmount.toFixed(2)})`,
            code: 'COLLECTION_EXCEEDS_BILLING',
          });
        } else {
          this.batchCollectedTotals.set(mapKey, priorBatchCollected + colAmount);
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    return String(parsedData.receiptNo || '').trim();
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

    // Fee rows are imported as historical/recorded (status: 'recorded'), not 'submitted'
    const createdCollection = await this.feeService.createCollection(
      {
        schemeId,
        seasonId: data.seasonId as string,
        billingId: data.billingId as string,
        farmerId: (data.farmerId as string) || null,
        wuaId: (data.wuaId as string) || null,
        amountNgn: String(data.amountNgn),
        paidOn: String(data.paidOn),
        receiptNo: String(data.receiptNo),
        status: 'recorded',
        importBatchId: row.batchId,
        createdBy: authz.userId,
      },
      authz,
      authz.userId,
    );

    return { targetEntityId: createdCollection.id, beforeImage: null };
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
      .from(feeCollection)
      .where(and(eq(feeCollection.id, row.targetEntityId), isNull(feeCollection.deletedAt)))
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

    // Soft delete fee collection
    await tx
      .update(feeCollection)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(feeCollection.id, row.targetEntityId));

    return { skipped: false };
  }
}
