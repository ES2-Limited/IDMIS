import { Injectable } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  indicator,
  indicatorValue,
  state,
  organisation,
  organisationState,
  eq,
  and,
  isNull,
} from '@idmis/db';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { IndicatorValueService } from '../services/indicator-value.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class IndicatorValueImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.indicator_value';
  readonly version = 1;
  readonly permission = permissions.ME_VALUE_SUBMIT;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.indicator_value'];

  constructor(private readonly valueService: IndicatorValueService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      indicatorCode: '1a',
      periodYear: 2026,
      periodQuarter: 1,
      scopeType: 'scheme',
      schemeCode: 'KRIS',
      disaggregation: '{"gender":"female"}',
      value: '4500.00',
      notes: 'Reported via field inspection',
    };
  }

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const indicatorCode = String(rawData.indicatorCode || '').trim();
    if (!indicatorCode) {
      errors.push({ column: 'indicatorCode', message: 'Indicator code is required' });
    } else {
      parsedData.indicatorCode = indicatorCode;
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

    if (
      rawData.periodQuarter !== undefined &&
      rawData.periodQuarter !== null &&
      String(rawData.periodQuarter).trim() !== ''
    ) {
      const qNum = Number(rawData.periodQuarter);
      if (isNaN(qNum) || qNum < 1 || qNum > 4) {
        errors.push({
          column: 'periodQuarter',
          message: 'Period quarter must be between 1 and 4 (or blank for annual)',
        });
      } else {
        parsedData.periodQuarter = qNum;
      }
    } else {
      parsedData.periodQuarter = null;
    }

    const scopeType = String(rawData.scopeType || '')
      .trim()
      .toLowerCase();
    if (!['national', 'state', 'scheme'].includes(scopeType)) {
      errors.push({
        column: 'scopeType',
        message: "Scope type must be 'national', 'state', or 'scheme'",
      });
    } else {
      parsedData.scopeType = scopeType;
    }

    if (rawData.stateCode) {
      parsedData.stateCode = String(rawData.stateCode).trim().toUpperCase();
    }
    if (rawData.schemeCode) {
      parsedData.schemeCode = String(rawData.schemeCode).trim().toUpperCase();
    }

    if (rawData.disaggregation) {
      if (typeof rawData.disaggregation === 'string') {
        try {
          parsedData.disaggregation = JSON.parse(rawData.disaggregation);
        } catch {
          errors.push({
            column: 'disaggregation',
            message: 'Disaggregation must be a valid JSON object string',
          });
        }
      } else if (typeof rawData.disaggregation === 'object') {
        parsedData.disaggregation = rawData.disaggregation;
      }
    } else {
      parsedData.disaggregation = {};
    }

    const valStr = String(rawData.value ?? '').trim();
    if (!valStr || !/^-?\d+(\.\d+)?$/.test(valStr)) {
      errors.push({ column: 'value', message: 'Value must be a valid decimal string' });
    } else {
      parsedData.value = valStr;
    }

    if (rawData.notes) {
      parsedData.notes = String(rawData.notes).trim();
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

    // 1. Resolve indicator and reject computed indicators
    if (data.indicatorCode) {
      const [foundInd] = await tx
        .select({ id: indicator.id, method: indicator.method })
        .from(indicator)
        .where(and(eq(indicator.code, String(data.indicatorCode)), isNull(indicator.deletedAt)))
        .limit(1);

      if (!foundInd) {
        errors.push({
          column: 'indicatorCode',
          message: `Referenced indicator code '${data.indicatorCode}' does not exist`,
        });
      } else {
        data.indicatorId = foundInd.id;
        if (foundInd.method === 'computed') {
          errors.push({
            column: 'indicatorCode',
            message: 'Cannot import values for computed indicators',
            code: 'computed_indicator_rejected',
          });
        }
      }
    }

    const scopeType = data.scopeType as string;

    // 2. Resolve scope locations & apply two-gate scope check
    if (scopeType === 'national') {
      if (!scope.isNational) {
        errors.push({
          column: 'scopeType',
          message: 'National scope is required to import national values',
          code: 'out_of_scope',
        });
      }
    } else if (scopeType === 'state') {
      if (!data.stateCode) {
        errors.push({ column: 'stateCode', message: "State code is required for 'state' scope" });
      } else {
        const [foundState] = await tx
          .select({ id: state.id })
          .from(state)
          .where(eq(state.code, String(data.stateCode)))
          .limit(1);

        if (!foundState) {
          errors.push({
            column: 'stateCode',
            message: `Referenced state code '${data.stateCode}' does not exist`,
          });
        } else {
          data.scopeStateId = foundState.id;
          if (!scope.isNational && (!scope.stateIds || !scope.stateIds.includes(foundState.id))) {
            errors.push({
              column: 'stateCode',
              message: 'Target state is outside your assigned scope',
              code: 'out_of_scope',
            });
          }
        }
      }
    } else if (scopeType === 'scheme') {
      if (!data.schemeCode) {
        errors.push({
          column: 'schemeCode',
          message: "Scheme code is required for 'scheme' scope",
        });
      } else {
        const [foundScheme] = await tx
          .select({ id: organisation.id, stateId: organisationState.stateId })
          .from(organisation)
          .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
          .where(
            and(
              eq(organisation.code, String(data.schemeCode)),
              eq(organisation.type, 'scheme'),
              isNull(organisation.deletedAt),
            ),
          )
          .limit(1);

        if (!foundScheme) {
          errors.push({
            column: 'schemeCode',
            message: `Referenced scheme code '${data.schemeCode}' does not exist`,
          });
        } else {
          data.scopeOrgId = foundScheme.id;
          data.scopeStateId = foundScheme.stateId ?? null;

          if (!scope.isNational) {
            const schemeMatch = scope.schemeIds?.includes(foundScheme.id);
            const stateMatch = foundScheme.stateId && scope.stateIds?.includes(foundScheme.stateId);
            if (!schemeMatch && !stateMatch) {
              errors.push({
                column: 'schemeCode',
                message: 'Target scheme is outside your assigned scope',
                code: 'out_of_scope',
              });
            }
          }
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const indicatorCode = String(parsedData.indicatorCode || '').trim();
    const periodYear = String(parsedData.periodYear || '').trim();
    const periodQuarter = String(parsedData.periodQuarter || 'A').trim();
    const scopeType = String(parsedData.scopeType || '').trim();
    const stateCode = String(parsedData.stateCode || '').trim();
    const schemeCode = String(parsedData.schemeCode || '').trim();
    const disagg = JSON.stringify(parsedData.disaggregation ?? {});
    return `${indicatorCode}#${periodYear}#${periodQuarter}#${scopeType}#${stateCode}#${schemeCode}#${disagg}`;
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
    const created = await this.valueService.createValue(
      {
        indicatorId: data.indicatorId as string,
        periodYear: data.periodYear as number,
        periodQuarter: (data.periodQuarter as number | null) ?? undefined,
        scopeType: data.scopeType as 'national' | 'state' | 'scheme',
        scopeStateId: data.scopeStateId as string | undefined,
        scopeOrgId: data.scopeOrgId as string | undefined,
        disaggregation: (data.disaggregation as Record<string, string | number | boolean>) ?? {},
        value: String(data.value),
        notes: data.notes as string | undefined,
        status: 'submitted',
      },
      authz,
      authz.userId,
      'import',
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
      .from(indicatorValue)
      .where(and(eq(indicatorValue.id, row.targetEntityId), isNull(indicatorValue.deletedAt)))
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

    await tx
      .update(indicatorValue)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(indicatorValue.id, row.targetEntityId));

    return { skipped: false };
  }
}
