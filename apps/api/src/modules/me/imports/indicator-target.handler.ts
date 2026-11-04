import { Injectable } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  indicator,
  indicatorTarget,
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
import { IndicatorTargetService } from '../services/indicator-target.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class IndicatorTargetImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.indicator_target';
  readonly version = 1;
  readonly permission = permissions.ME_TARGET_MANAGE;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.indicator_target'];

  constructor(private readonly targetService: IndicatorTargetService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      indicatorCode: '1a',
      year: 2026,
      scopeType: 'scheme',
      schemeCode: 'KRIS',
      value: '5000.00',
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

    const yearNum = Number(rawData.year);
    if (!rawData.year || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      errors.push({ column: 'year', message: 'Year must be a valid 4-digit year (2000-2100)' });
    } else {
      parsedData.year = yearNum;
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

    const valStr = String(rawData.value ?? '').trim();
    if (!valStr || !/^-?\d+(\.\d+)?$/.test(valStr)) {
      errors.push({ column: 'value', message: 'Value must be a valid decimal string' });
    } else {
      parsedData.value = valStr;
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

    // 1. Resolve indicator
    if (data.indicatorCode) {
      const [foundInd] = await tx
        .select({ id: indicator.id })
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
      }
    }

    const scopeType = data.scopeType as string;

    // 2. Resolve scope locations & apply two-gate scope check
    if (scopeType === 'national') {
      if (!scope.isNational) {
        errors.push({
          column: 'scopeType',
          message: 'National scope is required to import national targets',
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
        } else if (!foundScheme.stateId) {
          errors.push({
            column: 'schemeCode',
            message: `Scheme '${data.schemeCode}' has no associated state in organisation_state`,
          });
        } else {
          data.scopeOrgId = foundScheme.id;
          data.scopeStateId = foundScheme.stateId;

          if (!scope.isNational) {
            const schemeMatch = scope.schemeIds?.includes(foundScheme.id);
            const stateMatch = scope.stateIds?.includes(foundScheme.stateId);
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
    const year = String(parsedData.year || '').trim();
    const scopeType = String(parsedData.scopeType || '').trim();
    const stateCode = String(parsedData.stateCode || '').trim();
    const schemeCode = String(parsedData.schemeCode || '').trim();
    return `${indicatorCode}#${year}#${scopeType}#${stateCode}#${schemeCode}`;
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
    const created = await this.targetService.createTarget(
      {
        indicatorId: data.indicatorId as string,
        year: data.year as number,
        scopeType: data.scopeType as 'national' | 'state' | 'scheme',
        scopeStateId:
          data.scopeType === 'scheme' ? undefined : (data.scopeStateId as string | undefined),
        scopeOrgId:
          data.scopeType === 'scheme' ? (data.scopeOrgId as string | undefined) : undefined,
        value: String(data.value),
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
      .from(indicatorTarget)
      .where(and(eq(indicatorTarget.id, row.targetEntityId), isNull(indicatorTarget.deletedAt)))
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
      .update(indicatorTarget)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(indicatorTarget.id, row.targetEntityId));

    return { skipped: false };
  }
}
