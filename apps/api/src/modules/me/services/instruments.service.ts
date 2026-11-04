import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  permissions,
  type CreateScorecardInput,
  type UpdateScorecardInput,
  type ListScorecardsQuery,
  type CreateMatchingGrantInput,
  type UpdateMatchingGrantInput,
  type ListMatchingGrantsQuery,
  type CreateTechAdoptionInput,
  type UpdateTechAdoptionInput,
  type ListTechAdoptionsQuery,
  type ApproveTechAdoptionInput,
  type ReturnTechAdoptionInput,
} from '@idmis/contracts';
import { ScorecardRepository } from '../repositories/scorecard.repository';
import { MatchingGrantRepository } from '../repositories/matching-grant.repository';
import { TechAdoptionRepository } from '../repositories/tech-adoption.repository';
import { FileRepository, LookupRepository } from '../../core/public';
import { assertMeScope } from '../utils/assert-me-scope';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import type { UserAuthz } from '../../../platform/auth';
import { eventBus } from '../../../platform/events/event-bus';

@Injectable()
export class InstrumentsService {
  constructor(
    private readonly scorecardRepo: ScorecardRepository,
    private readonly matchingGrantRepo: MatchingGrantRepository,
    private readonly techAdoptionRepo: TechAdoptionRepository,
    private readonly fileRepo: FileRepository,
    private readonly lookupRepo: LookupRepository,
  ) {}

  // =========================================================================
  // 1. Scorecard
  // =========================================================================

  async createScorecard(input: CreateScorecardInput, authz: UserAuthz, actorUserId: string) {
    const resolvedScope = await assertMeScope(authz, permissions.ME_INSTRUMENTS_MANAGE, {
      scopeType: 'scheme',
      scopeOrgId: input.schemeId,
    });

    if (input.fileId) {
      const fileRecord = await this.fileRepo.findById(input.fileId);
      if (!fileRecord) {
        throw new BadRequestException(`Referenced file '${input.fileId}' not found`);
      }
    }

    const existing = await this.scorecardRepo.findBySchemeAndYear(input.schemeId, input.periodYear);
    if (existing) {
      throw new ConflictProblemException({
        detail: `Scorecard already exists for scheme ${input.schemeId} and year ${input.periodYear}`,
        current: existing,
        currentVersion: existing.version,
      });
    }

    const created = await runInTransaction(
      async (tx) => {
        return this.scorecardRepo.create(
          {
            id: input.id,
            schemeId: input.schemeId,
            periodYear: input.periodYear,
            publishedOn: input.publishedOn ?? null,
            fileId: input.fileId ?? null,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'me.scorecard',
          actorUserId,
          stateId: resolvedScope.scopeStateId ?? undefined,
        },
      },
    );

    if (input.publishedOn) {
      eventBus.emitRecompute({ schemeId: input.schemeId });
    }

    return created;
  }

  async updateScorecard(
    id: string,
    expectedVersion: number,
    input: UpdateScorecardInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.scorecardRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Scorecard not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_INSTRUMENTS_MANAGE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    if (input.schemeId && input.schemeId !== existing.schemeId) {
      await assertMeScope(authz, permissions.ME_INSTRUMENTS_MANAGE, {
        scopeType: 'scheme',
        scopeOrgId: input.schemeId,
      });
    }

    if (input.fileId) {
      const fileRecord = await this.fileRepo.findById(input.fileId);
      if (!fileRecord) {
        throw new BadRequestException(`Referenced file '${input.fileId}' not found`);
      }
    }

    const targetSchemeId = input.schemeId ?? existing.schemeId;
    const targetYear = input.periodYear ?? existing.periodYear;
    if (targetSchemeId !== existing.schemeId || targetYear !== existing.periodYear) {
      const duplicate = await this.scorecardRepo.findBySchemeAndYear(targetSchemeId, targetYear);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictProblemException({
          detail: `Scorecard already exists for scheme ${targetSchemeId} and year ${targetYear}`,
          current: duplicate,
          currentVersion: duplicate.version,
        });
      }
    }

    const updated = await runInTransaction(
      async (tx) => {
        return this.scorecardRepo.update(
          id,
          expectedVersion,
          {
            schemeId: input.schemeId,
            periodYear: input.periodYear,
            publishedOn: input.publishedOn,
            fileId: input.fileId,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'me.scorecard',
          actorUserId,
          entityId: id,
        },
      },
    );

    if (input.publishedOn !== undefined && input.publishedOn !== existing.publishedOn) {
      eventBus.emitRecompute({ schemeId: targetSchemeId });
    }

    return updated;
  }

  async deleteScorecard(
    id: string,
    expectedVersion: number,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.scorecardRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Scorecard not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_INSTRUMENTS_MANAGE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    return runInTransaction(
      async (tx) => {
        return this.scorecardRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.scorecard',
          actorUserId,
          entityId: id,
        },
      },
    );
  }

  async getScorecard(id: string, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      throw new NotFoundException('Scorecard not found');
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    const item = await this.scorecardRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Scorecard not found');
    }
    return item;
  }

  async listScorecards(query: ListScorecardsQuery, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      return { data: [], total: 0, nextCursor: null };
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    return this.scorecardRepo.list(query, scope);
  }

  // =========================================================================
  // 2. Matching Grant
  // =========================================================================

  async createMatchingGrant(
    input: CreateMatchingGrantInput,
    authz: UserAuthz,
    actorUserId: string,
    importBatchId?: string,
  ) {
    const resolvedScope = await assertMeScope(authz, permissions.ME_INSTRUMENTS_MANAGE, {
      scopeType: 'scheme',
      scopeOrgId: input.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        return this.matchingGrantRepo.create(
          {
            id: input.id,
            schemeId: input.schemeId,
            wuaId: input.wuaId ?? null,
            purpose: input.purpose ?? null,
            amountNgn: input.amountNgn,
            approvedOn: input.approvedOn ?? null,
            disbursedOn: input.disbursedOn ?? null,
            importBatchId: importBatchId ?? null,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'me.matching_grant',
          actorUserId,
          stateId: resolvedScope.scopeStateId ?? undefined,
        },
      },
    );
  }

  async updateMatchingGrant(
    id: string,
    expectedVersion: number,
    input: UpdateMatchingGrantInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.matchingGrantRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Matching grant not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_INSTRUMENTS_MANAGE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    if (input.schemeId && input.schemeId !== existing.schemeId) {
      await assertMeScope(authz, permissions.ME_INSTRUMENTS_MANAGE, {
        scopeType: 'scheme',
        scopeOrgId: input.schemeId,
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.matchingGrantRepo.update(
          id,
          expectedVersion,
          {
            schemeId: input.schemeId,
            wuaId: input.wuaId,
            purpose: input.purpose,
            amountNgn: input.amountNgn,
            approvedOn: input.approvedOn,
            disbursedOn: input.disbursedOn,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'me.matching_grant',
          actorUserId,
          entityId: id,
        },
      },
    );
  }

  async deleteMatchingGrant(
    id: string,
    expectedVersion: number,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.matchingGrantRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Matching grant not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_INSTRUMENTS_MANAGE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    return runInTransaction(
      async (tx) => {
        return this.matchingGrantRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.matching_grant',
          actorUserId,
          entityId: id,
        },
      },
    );
  }

  async getMatchingGrant(id: string, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      throw new NotFoundException('Matching grant not found');
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    const item = await this.matchingGrantRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Matching grant not found');
    }
    return item;
  }

  async listMatchingGrants(query: ListMatchingGrantsQuery, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      return { data: [], total: 0, nextCursor: null };
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    return this.matchingGrantRepo.list(query, scope);
  }

  // =========================================================================
  // 3. Technology Adoption
  // =========================================================================

  async createTechAdoption(
    input: CreateTechAdoptionInput,
    authz: UserAuthz,
    actorUserId: string,
    deviceId?: string,
    importBatchId?: string,
  ) {
    const resolvedScope = await assertMeScope(authz, permissions.ME_ADOPTION_RECORD, {
      scopeType: 'scheme',
      scopeOrgId: input.schemeId,
    });

    if (!input.gender || (input.gender !== 'female' && input.gender !== 'male')) {
      throw new BadRequestException("Gender is required and must be 'female' or 'male'");
    }

    const techLookup = await this.lookupRepo.findValueById(input.technologyId);
    if (!techLookup) {
      throw new BadRequestException(`Technology lookup '${input.technologyId}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        return this.techAdoptionRepo.create(
          {
            id: input.id,
            schemeId: input.schemeId,
            farmerId: input.farmerId ?? null,
            technologyId: input.technologyId,
            gender: input.gender,
            adoptedOn: input.adoptedOn ?? null,
            status: 'submitted',
            submittedBy: actorUserId,
            submittedAt: new Date().toISOString(),
            deviceId: deviceId ?? null,
            importBatchId: importBatchId ?? null,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'me.tech_adoption',
          actorUserId,
          stateId: resolvedScope.scopeStateId ?? undefined,
        },
      },
    );
  }

  async updateTechAdoption(
    id: string,
    expectedVersion: number,
    input: UpdateTechAdoptionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.techAdoptionRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Tech adoption record not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_ADOPTION_RECORD,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    if (input.schemeId && input.schemeId !== existing.schemeId) {
      await assertMeScope(authz, permissions.ME_ADOPTION_RECORD, {
        scopeType: 'scheme',
        scopeOrgId: input.schemeId,
      });
    }

    if (input.technologyId && input.technologyId !== existing.technologyId) {
      const techLookup = await this.lookupRepo.findValueById(input.technologyId);
      if (!techLookup) {
        throw new BadRequestException(`Technology lookup '${input.technologyId}' not found`);
      }
    }

    if (input.gender && input.gender !== 'female' && input.gender !== 'male') {
      throw new BadRequestException("Gender must be 'female' or 'male'");
    }

    return runInTransaction(
      async (tx) => {
        return this.techAdoptionRepo.update(
          id,
          expectedVersion,
          {
            schemeId: input.schemeId,
            farmerId: input.farmerId,
            technologyId: input.technologyId,
            gender: input.gender,
            adoptedOn: input.adoptedOn,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'me.tech_adoption',
          actorUserId,
          entityId: id,
        },
      },
    );
  }

  async deleteTechAdoption(
    id: string,
    expectedVersion: number,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.techAdoptionRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Tech adoption record not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_ADOPTION_RECORD,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    return runInTransaction(
      async (tx) => {
        return this.techAdoptionRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.tech_adoption',
          actorUserId,
          entityId: id,
        },
      },
    );
  }

  async approveTechAdoption(
    id: string,
    input: ApproveTechAdoptionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.techAdoptionRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Tech adoption record not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_VALUE_APPROVE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    if (existing.status !== 'submitted') {
      throw new ConflictProblemException({
        detail: `Cannot approve tech adoption in status '${existing.status}' (expected 'submitted')`,
        current: existing,
        currentVersion: existing.version,
      });
    }

    if (existing.submittedBy && existing.submittedBy === actorUserId) {
      throw new ForbiddenException(
        'Self-approval is forbidden. A user cannot approve their own submission.',
      );
    }

    const expectedVersion = input.version ?? existing.version;

    const approved = await runInTransaction(
      async (tx) => {
        return this.techAdoptionRepo.approve(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'approve',
          entity: 'me.tech_adoption',
          actorUserId,
          entityId: id,
          before: existing,
        },
      },
    );

    eventBus.emitRecompute({ schemeId: existing.schemeId });
    return approved;
  }

  async returnTechAdoption(
    id: string,
    input: ReturnTechAdoptionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.techAdoptionRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Tech adoption record not found');
    }

    await assertMeScope(
      authz,
      permissions.ME_VALUE_APPROVE,
      { scopeType: 'scheme', scopeOrgId: existing.schemeId },
      true,
    );

    if (!input.comment || !input.comment.trim()) {
      throw new BadRequestException('Comment is required to return a tech adoption record');
    }

    if (existing.status !== 'submitted') {
      throw new ConflictProblemException({
        detail: `Cannot return tech adoption in status '${existing.status}' (expected 'submitted')`,
        current: existing,
        currentVersion: existing.version,
      });
    }

    const expectedVersion = input.version ?? existing.version;

    const returned = await runInTransaction(
      async (tx) => {
        return this.techAdoptionRepo.return(
          id,
          expectedVersion,
          actorUserId,
          input.comment.trim(),
          tx,
        );
      },
      {
        audit: {
          action: 'return',
          entity: 'me.tech_adoption',
          actorUserId,
          entityId: id,
          before: existing,
        },
      },
    );

    eventBus.emitRecompute({ schemeId: existing.schemeId });
    return returned;
  }

  async getTechAdoption(id: string, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      throw new NotFoundException('Tech adoption record not found');
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    const item = await this.techAdoptionRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Tech adoption record not found');
    }
    return item;
  }

  async listTechAdoptions(query: ListTechAdoptionsQuery, authz: UserAuthz) {
    if (!authz.can(permissions.ME_INDICATOR_READ)) {
      return { data: [], total: 0, nextCursor: null };
    }

    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);
    return this.techAdoptionRepo.list(query, scope);
  }
}
