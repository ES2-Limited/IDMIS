import { Injectable } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { matchingGrant, organisation, organisationState, wua, eq, and, isNull } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { InstrumentsService } from '../services/instruments.service';
import { isMeInScope } from '../utils/assert-me-scope';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class MatchingGrantImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.matching_grant';
  readonly version = 1;
  readonly permission = permissions.ME_INSTRUMENTS_MANAGE;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.matching_grant'];

  constructor(private readonly instrumentsService: InstrumentsService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      schemeCode: 'KRIS',
      wuaRegNo: 'WUA-001',
      purpose: 'Canal maintenance equipment',
      amountNgn: '1500000.00',
      approvedOn: '2026-03-01',
      disbursedOn: '2026-04-01',
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const schemeCode = String(rawData.schemeCode || '')
      .trim()
      .toUpperCase();
    if (!schemeCode) {
      errors.push({ column: 'schemeCode', message: 'Scheme code is required' });
    } else {
      parsedData.schemeCode = schemeCode;
    }

    const amountNgn = String(rawData.amountNgn || '').trim();
    if (!amountNgn) {
      errors.push({ column: 'amountNgn', message: 'Amount in NGN is required' });
    } else if (!/^-?\d+(\.\d{1,2})?$/.test(amountNgn)) {
      errors.push({
        column: 'amountNgn',
        message: 'Amount must be a valid currency decimal string (e.g. 1500000.00)',
      });
    } else {
      parsedData.amountNgn = amountNgn;
    }

    if (rawData.purpose) {
      parsedData.purpose = String(rawData.purpose).trim();
    }

    if (rawData.wuaRegNo) {
      parsedData.wuaRegNo = String(rawData.wuaRegNo).trim();
    }

    if (rawData.approvedOn) {
      const appDate = String(rawData.approvedOn).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(appDate)) {
        errors.push({
          column: 'approvedOn',
          message: 'Approved on date must be in YYYY-MM-DD format',
        });
      } else {
        parsedData.approvedOn = appDate;
      }
    }

    if (rawData.disbursedOn) {
      const disbDate = String(rawData.disbursedOn).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(disbDate)) {
        errors.push({
          column: 'disbursedOn',
          message: 'Disbursed on date must be in YYYY-MM-DD format',
        });
      } else {
        parsedData.disbursedOn = disbDate;
      }
    }

    return {
      rawData,
      parsedData,
      errors,
    };
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
    const schemeCode = parsedData.schemeCode as string;
    const wuaRegNo = parsedData.wuaRegNo as string | undefined;

    if (!schemeCode) {
      return errors;
    }

    const [schemeOrg] = await tx
      .select({
        id: organisation.id,
        code: organisation.code,
        stateId: organisationState.stateId,
      })
      .from(organisation)
      .leftJoin(organisationState, eq(organisationState.organisationId, organisation.id))
      .where(and(eq(organisation.code, schemeCode), eq(organisation.type, 'scheme')))
      .limit(1);

    if (!schemeOrg) {
      errors.push({
        column: 'schemeCode',
        message: `Scheme with code '${schemeCode}' not found`,
        code: 'not_found',
      });
      return errors;
    }

    parsedData.schemeId = schemeOrg.id;
    parsedData.stateId = schemeOrg.stateId;

    if (
      !isMeInScope(scope, {
        scopeType: 'scheme',
        scopeOrgId: schemeOrg.id,
        scopeStateId: schemeOrg.stateId,
      })
    ) {
      errors.push({
        column: 'schemeCode',
        message: 'Scheme is outside your assigned scope',
        code: 'out_of_scope',
      });
      return errors;
    }

    if (wuaRegNo) {
      const [wuaRow] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(
          and(eq(wua.regNo, wuaRegNo), eq(wua.organisationId, schemeOrg.id), isNull(wua.deletedAt)),
        )
        .limit(1);

      if (!wuaRow) {
        errors.push({
          column: 'wuaRegNo',
          message: `WUA with registration number '${wuaRegNo}' not found in scheme '${schemeCode}'`,
          code: 'not_found',
        });
      } else {
        parsedData.wuaId = wuaRow.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || '').trim();
    const purpose = String(parsedData.purpose || '').trim();
    const amountNgn = String(parsedData.amountNgn || '').trim();
    return `${schemeCode}#${purpose}#${amountNgn}`;
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
    const created = await this.instrumentsService.createMatchingGrant(
      {
        schemeId: data.schemeId as string,
        wuaId: (data.wuaId as string | undefined) ?? undefined,
        purpose: (data.purpose as string | undefined) ?? undefined,
        amountNgn: String(data.amountNgn),
        approvedOn: (data.approvedOn as string | undefined) ?? undefined,
        disbursedOn: (data.disbursedOn as string | undefined) ?? undefined,
      },
      authz,
      authz.userId,
      row.batchId,
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
      .from(matchingGrant)
      .where(and(eq(matchingGrant.id, row.targetEntityId), isNull(matchingGrant.deletedAt)))
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

    await tx
      .update(matchingGrant)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(matchingGrant.id, row.targetEntityId));

    return { skipped: false };
  }
}
