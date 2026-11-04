import { Injectable } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { scorecard, organisation, organisationState, eq, and, isNull } from '@idmis/db';
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
export class ScorecardImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.scorecard';
  readonly version = 1;
  readonly permission = permissions.ME_INSTRUMENTS_MANAGE;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.scorecard'];

  constructor(private readonly instrumentsService: InstrumentsService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      schemeCode: 'KRIS',
      periodYear: 2026,
      publishedOn: '2026-06-30',
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

    const yearNum = Number(rawData.periodYear);
    if (!rawData.periodYear || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      errors.push({
        column: 'periodYear',
        message: 'Period year must be a valid 4-digit year (2000-2100)',
      });
    } else {
      parsedData.periodYear = yearNum;
    }

    if (rawData.publishedOn) {
      const pubDate = String(rawData.publishedOn).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) {
        errors.push({
          column: 'publishedOn',
          message: 'Published on date must be in YYYY-MM-DD format',
        });
      } else {
        parsedData.publishedOn = pubDate;
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
    const periodYear = parsedData.periodYear as number;

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

    if (periodYear) {
      const [existing] = await tx
        .select({ id: scorecard.id })
        .from(scorecard)
        .where(
          and(
            eq(scorecard.schemeId, schemeOrg.id),
            eq(scorecard.periodYear, periodYear),
            isNull(scorecard.deletedAt),
          ),
        )
        .limit(1);

      if (existing) {
        errors.push({
          column: 'periodYear',
          message: `Scorecard already exists for scheme '${schemeCode}' and year ${periodYear}`,
          code: 'duplicate_entry',
        });
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || '').trim();
    const periodYear = String(parsedData.periodYear || '').trim();
    return `${schemeCode}#${periodYear}`;
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
    const created = await this.instrumentsService.createScorecard(
      {
        schemeId: data.schemeId as string,
        periodYear: data.periodYear as number,
        publishedOn: (data.publishedOn as string | undefined) ?? undefined,
      },
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
      .from(scorecard)
      .where(and(eq(scorecard.id, row.targetEntityId), isNull(scorecard.deletedAt)))
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
      .update(scorecard)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(scorecard.id, row.targetEntityId));

    return { skipped: false };
  }
}
