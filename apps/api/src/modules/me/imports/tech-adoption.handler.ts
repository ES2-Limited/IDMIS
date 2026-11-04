import { Injectable } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  techAdoption,
  organisation,
  organisationState,
  lookupValue,
  lookupType,
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
import { InstrumentsService } from '../services/instruments.service';
import { isMeInScope } from '../utils/assert-me-scope';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class TechAdoptionImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.tech_adoption';
  readonly version = 1;
  readonly permission = permissions.ME_ADOPTION_RECORD;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.tech_adoption'];

  constructor(private readonly instrumentsService: InstrumentsService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      schemeCode: 'KRIS',
      technologyCode: 'drip_irrigation',
      gender: 'female',
      farmerId: '',
      adoptedOn: '2026-05-15',
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

    const technologyCode = String(rawData.technologyCode || '').trim();
    if (!technologyCode) {
      errors.push({ column: 'technologyCode', message: 'Technology code is required' });
    } else {
      parsedData.technologyCode = technologyCode;
    }

    const gender = String(rawData.gender || '')
      .trim()
      .toLowerCase();
    if (!gender) {
      errors.push({ column: 'gender', message: 'Gender is required' });
    } else if (gender !== 'female' && gender !== 'male') {
      errors.push({ column: 'gender', message: "Gender must be 'female' or 'male'" });
    } else {
      parsedData.gender = gender;
    }

    if (rawData.farmerId) {
      parsedData.farmerId = String(rawData.farmerId).trim();
    }

    if (rawData.adoptedOn) {
      const adoptedDate = String(rawData.adoptedOn).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(adoptedDate)) {
        errors.push({
          column: 'adoptedOn',
          message: 'Adopted on date must be in YYYY-MM-DD format',
        });
      } else {
        parsedData.adoptedOn = adoptedDate;
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
    const technologyCode = parsedData.technologyCode as string;

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

    if (technologyCode) {
      // Lookup technology by code under 'technology' lookup type, or fallback to direct id/code
      const [techRow] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .leftJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
        .where(and(eq(lookupType.key, 'technology'), eq(lookupValue.code, technologyCode)))
        .limit(1);

      if (!techRow) {
        // Fallback check by direct lookup value ID or code
        const [directLookup] = await tx
          .select({ id: lookupValue.id })
          .from(lookupValue)
          .where(eq(lookupValue.code, technologyCode))
          .limit(1);

        if (!directLookup) {
          errors.push({
            column: 'technologyCode',
            message: `Technology lookup '${technologyCode}' not found`,
            code: 'not_found',
          });
        } else {
          parsedData.technologyId = directLookup.id;
        }
      } else {
        parsedData.technologyId = techRow.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || '').trim();
    const technologyCode = String(parsedData.technologyCode || '').trim();
    const gender = String(parsedData.gender || '').trim();
    const farmerId = String(parsedData.farmerId || '').trim();
    const adoptedOn = String(parsedData.adoptedOn || '').trim();
    return `${schemeCode}#${technologyCode}#${gender}#${farmerId}#${adoptedOn}`;
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
    const created = await this.instrumentsService.createTechAdoption(
      {
        schemeId: data.schemeId as string,
        farmerId: (data.farmerId as string | undefined) ?? undefined,
        technologyId: data.technologyId as string,
        gender: data.gender as 'female' | 'male',
        adoptedOn: (data.adoptedOn as string | undefined) ?? undefined,
      },
      authz,
      authz.userId,
      undefined,
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
      .from(techAdoption)
      .where(and(eq(techAdoption.id, row.targetEntityId), isNull(techAdoption.deletedAt)))
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
      .update(techAdoption)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(techAdoption.id, row.targetEntityId));

    return { skipped: false };
  }
}
