import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  permissions,
  type CreateDamSafetyInspectionInput,
  type UpdateDamSafetyInspectionInput,
  type ReturnDamInspectionInput,
  type ListDamInspectionsQuery,
} from '@idmis/contracts';
import {
  DamInspectionRepository,
  type ComponentConditionData,
} from '../repositories/dam-inspection.repository';
import { DamRepository } from '../repositories/dam.repository';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { eventBus } from '../../../platform/events/event-bus';
import { calculateMeetsStandard } from '../helpers/dam-safety.helper';
import type { UserAuthz } from '../../../platform/auth';
import { db, lookupValue, inArray } from '@idmis/db';

@Injectable()
export class DamInspectionService {
  constructor(
    private readonly damInspectionRepo: DamInspectionRepository,
    private readonly damRepo: DamRepository,
  ) {}

  private async resolveComponentCodes(
    components: Array<{ component: string; ratingId: string }>,
  ): Promise<Array<{ component: string; ratingCode?: string }>> {
    if (!components || components.length === 0) {
      return [];
    }
    const ratingIds = [...new Set(components.map((c) => c.ratingId))];
    const ratingRows = await db
      .select({ id: lookupValue.id, code: lookupValue.code })
      .from(lookupValue)
      .where(inArray(lookupValue.id, ratingIds));
    const codeMap = new Map(ratingRows.map((r) => [r.id, r.code]));

    return components.map((c) => ({
      component: c.component,
      ratingCode: codeMap.get(c.ratingId),
    }));
  }

  async create(input: CreateDamSafetyInspectionInput, authz: UserAuthz, userId: string) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_RECORD);

    // Verify dam exists and is in scope
    const damRecord = await this.damRepo.findById(input.damId, scope);
    if (!damRecord) {
      throw new NotFoundException({
        code: 'DAM_NOT_FOUND',
        message: 'Dam not found or outside user scope',
      });
    }

    const componentInputs = input.components ?? [];
    const resolvedComponents = await this.resolveComponentCodes(componentInputs);
    // Server computes meetsStandard; client input is ignored
    const meetsStandard = calculateMeetsStandard(resolvedComponents);

    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        const inspection = await this.damInspectionRepo.create(
          {
            id: (input as { id?: string }).id,
            damId: input.damId,
            inspectedOn: input.inspectedOn,
            nextDueOn: input.nextDueOn,
            hazardClassId: input.hazardClassId,
            specificHazards: input.specificHazards,
            safetyContact: input.safetyContact,
            staffOnSite: input.staffOnSite,
            staffQualifications: input.staffQualifications,
            safetyBudgetNgn: input.safetyBudgetNgn,
            meetsStandard,
            status: 'submitted',
            submittedBy: userId,
            submittedAt: now,
            createdBy: userId,
          },
          componentInputs as ComponentConditionData[],
          tx,
        );

        return {
          ...inspection,
          schemeId: damRecord.basinId,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'create',
          entity: 'blis.dam_safety_inspection',
          entityId: input.damId,
          after: {
            damId: input.damId,
            inspectedOn: input.inspectedOn,
            meetsStandard,
            status: 'submitted',
          },
        },
      },
    );
  }

  async findById(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_RECORD);
    const inspection = await this.damInspectionRepo.findById(id, scope);
    if (!inspection) {
      throw new NotFoundException({
        code: 'INSPECTION_NOT_FOUND',
        message: 'Dam safety inspection not found or outside user scope',
      });
    }
    const components = await this.damInspectionRepo.findComponents(id);
    return {
      ...inspection,
      components,
    };
  }

  async list(query: ListDamInspectionsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_RECORD);
    return this.damInspectionRepo.list(query, scope);
  }

  async update(
    id: string,
    version: number,
    input: UpdateDamSafetyInspectionInput,
    authz: UserAuthz,
    userId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_RECORD);
    const existing = await this.damInspectionRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException({
        code: 'INSPECTION_NOT_FOUND',
        message: 'Dam safety inspection not found or outside user scope',
      });
    }

    if (existing.status === 'approved') {
      throw new BadRequestException({
        code: 'INSPECTION_LOCKED',
        message: 'Approved inspections are locked against modifications',
      });
    }

    let meetsStandard: boolean | undefined = undefined;
    let componentInputs: ComponentConditionData[] | undefined = undefined;

    if (input.components !== undefined) {
      componentInputs = input.components as ComponentConditionData[];
      const resolved = await this.resolveComponentCodes(componentInputs);
      meetsStandard = calculateMeetsStandard(resolved);
    }

    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        const updated = await this.damInspectionRepo.update(
          id,
          version,
          {
            inspectedOn: input.inspectedOn,
            nextDueOn: input.nextDueOn,
            hazardClassId: input.hazardClassId,
            specificHazards: input.specificHazards,
            safetyContact: input.safetyContact,
            staffOnSite: input.staffOnSite,
            staffQualifications: input.staffQualifications,
            safetyBudgetNgn: input.safetyBudgetNgn,
            meetsStandard,
            status: 'submitted',
            submittedBy: userId,
            submittedAt: now,
            returnedBy: null,
            returnedAt: null,
            returnComment: null,
            updatedBy: userId,
          },
          componentInputs,
          tx,
        );

        return {
          ...updated,
          schemeId: existing.basinId,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'update',
          entity: 'blis.dam_safety_inspection',
          entityId: id,
          after: {
            id,
            status: 'submitted',
            meetsStandard: meetsStandard ?? existing.meetsStandard,
          },
        },
      },
    );
  }

  async submit(id: string, version: number, authz: UserAuthz, userId: string) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_RECORD);
    const existing = await this.damInspectionRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException({
        code: 'INSPECTION_NOT_FOUND',
        message: 'Dam safety inspection not found or outside user scope',
      });
    }

    if (existing.status === 'approved') {
      throw new BadRequestException({
        code: 'ALREADY_APPROVED',
        message: 'Inspection is already approved',
      });
    }

    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        return this.damInspectionRepo.update(
          id,
          version,
          {
            status: 'submitted',
            submittedBy: userId,
            submittedAt: now,
            returnedBy: null,
            returnedAt: null,
            returnComment: null,
            updatedBy: userId,
          },
          undefined,
          tx,
        );
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'update',
          entity: 'blis.dam_safety_inspection',
          entityId: id,
          after: { id, status: 'submitted' },
        },
      },
    );
  }

  async approve(id: string, version: number, authz: UserAuthz, userId: string) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_APPROVE);
    const existing = await this.damInspectionRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException({
        code: 'INSPECTION_NOT_FOUND',
        message: 'Dam safety inspection not found or outside user scope',
      });
    }

    // Separation of duties / deny self-approval
    if (existing.submittedBy === userId) {
      throw new ForbiddenException({
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'Users cannot approve their own inspection submissions',
      });
    }

    const now = new Date().toISOString();

    const updated = await runInTransaction(
      async (tx) => {
        const res = await this.damInspectionRepo.update(
          id,
          version,
          {
            status: 'approved',
            approvedBy: userId,
            approvedAt: now,
            returnedBy: null,
            returnedAt: null,
            returnComment: null,
            updatedBy: userId,
          },
          undefined,
          tx,
        );

        // Refresh materialised view: blis.mv_dam_status
        await this.damInspectionRepo.refreshMvDamStatus(tx);

        // Outbox event 'blis.dam.inspected'
        await enqueueOutboxEvent(tx, {
          eventType: 'blis.dam.inspected',
          aggregateType: 'dam',
          aggregateId: existing.damId,
          payload: {
            damId: existing.damId,
            inspectionId: id,
            inspectedOn: existing.inspectedOn,
            meetsStandard: existing.meetsStandard,
            approvedBy: userId,
            approvedAt: now,
          },
        });

        return res;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'approve',
          entity: 'blis.dam_safety_inspection',
          entityId: id,
          after: { id, status: 'approved', approvedBy: userId, approvedAt: now },
        },
      },
    );

    // Emit recompute event for Indicator 5
    eventBus.emitRecompute({});

    return updated;
  }

  async returnInspection(
    id: string,
    version: number,
    input: ReturnDamInspectionInput,
    authz: UserAuthz,
    userId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_INSPECTION_APPROVE);
    const existing = await this.damInspectionRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException({
        code: 'INSPECTION_NOT_FOUND',
        message: 'Dam safety inspection not found or outside user scope',
      });
    }

    if (!input.comment || input.comment.trim().length === 0) {
      throw new BadRequestException({
        code: 'COMMENT_REQUIRED',
        message: 'A comment explaining the return reason is required',
      });
    }

    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        return this.damInspectionRepo.update(
          id,
          version,
          {
            status: 'returned',
            returnedBy: userId,
            returnedAt: now,
            returnComment: input.comment.trim(),
            updatedBy: userId,
          },
          undefined,
          tx,
        );
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'return',
          entity: 'blis.dam_safety_inspection',
          entityId: id,
          after: { id, status: 'returned', returnComment: input.comment },
        },
      },
    );
  }
}
