import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  training,
  trainingAttendance,
  farmer,
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
import { TrainingService } from '../services/training.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class TrainingImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.training';
  readonly version = 1;
  readonly permission = permissions.SLIS_TRAINING_MANAGE;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.training'];

  constructor(private readonly trainingService: TrainingService) {}

  getExampleRow(): Record<string, unknown> {
    return {
      topic: 'Water Scheduling Best Practices',
      tags: 'water_management,governance',
      heldOn: '2026-03-10',
      venue: 'Sector A Community Hall',
      farmerCode: 'KRIS-SEC1-001',
      staffName: 'Musa Bello',
      gender: 'male',
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

    const topic = String(rawData.topic || '').trim();
    if (!topic) {
      errors.push({ column: 'topic', message: 'Training topic is required' });
    } else {
      parsedData.topic = topic;
    }

    const heldOn = String(rawData.heldOn || '').trim();
    if (!heldOn) {
      errors.push({ column: 'heldOn', message: 'Held on date is required' });
    } else {
      parsedData.heldOn = heldOn;
    }

    if (rawData.tags) {
      parsedData.tags = String(rawData.tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (rawData.venue) {
      parsedData.venue = String(rawData.venue).trim();
    }

    if (rawData.farmerCode) {
      parsedData.farmerCode = String(rawData.farmerCode).trim();
    }
    if (rawData.staffName) {
      parsedData.staffName = String(rawData.staffName).trim();
    }
    if (rawData.gender) {
      parsedData.gender = String(rawData.gender).trim().toLowerCase();
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

    // Resolve attendee farmer if given
    if (data.farmerCode && schemeId) {
      const farmerCode = String(data.farmerCode).trim();
      const [f] = await tx
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

      if (!f) {
        errors.push({
          column: 'farmerCode',
          message: `Referenced Attendee Farmer Code '${farmerCode}' does not exist in scheme`,
        });
      } else {
        data.farmerId = f.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || parsedData.schemeId || '').toUpperCase();
    const topic = String(parsedData.topic || '').trim();
    const heldOn = String(parsedData.heldOn || '').trim();
    return `${schemeCode}#${topic}#${heldOn}`;
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

    const created = await this.trainingService.createTraining(
      {
        schemeId,
        topic: String(data.topic),
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
        heldOn: String(data.heldOn),
        venue: data.venue ? String(data.venue) : undefined,
        status: 'submitted',
        importBatchId: row.batchId,
        submittedBy: authz.userId,
        submittedAt: new Date().toISOString(),
      } as Parameters<typeof this.trainingService.createTraining>[0],
      authz,
      authz.userId,
    );

    // Record training attendance if attendee info was provided
    if (data.farmerId || data.staffName) {
      await this.trainingService.recordAttendance(
        {
          trainingId: created.id,
          farmerId: (data.farmerId as string) || undefined,
          staffName: data.staffName ? String(data.staffName) : undefined,
          gender: (data.gender as 'female' | 'male') || undefined,
        },
        authz,
        authz.userId,
      );
    }

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
      .from(training)
      .where(and(eq(training.id, row.targetEntityId), isNull(training.deletedAt)))
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

    // Soft delete training attendance rows
    await tx
      .update(trainingAttendance)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(trainingAttendance.trainingId, row.targetEntityId));

    // Soft delete training
    await tx
      .update(training)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(training.id, row.targetEntityId));

    return { skipped: false };
  }
}
