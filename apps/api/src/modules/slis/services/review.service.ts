import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  permissions,
  type ApproveRecordInput,
  type BulkApproveInput,
  type BulkApproveResponse,
  type ListReviewQueueQuery,
  type ReturnRecordInput,
  type SubmitForReviewInput,
} from '@idmis/contracts';
import { ReviewRepository } from '../repositories/review.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class ReviewService {
  constructor(private readonly reviewRepo: ReviewRepository) {}

  async listQueue(query: ListReviewQueueQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_REVIEW_APPROVE);
    return this.reviewRepo.listQueue(scope, query);
  }

  async submitRecords(
    entity: string,
    input: SubmitForReviewInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_REVIEW_SUBMIT);

    // Verify all records exist, are in scope, and are in 'draft' or 'returned' status
    for (const recordId of input.recordIds) {
      const record = await this.reviewRepo.findRecord(entity, recordId, scope);
      if (!record) {
        throw new NotFoundException(`Record ${recordId} of type ${entity} not found`);
      }
      if (record.status !== 'draft' && record.status !== 'returned') {
        throw new BadRequestException(
          `Record ${recordId} cannot be submitted for review because it is currently '${record.status}'`,
        );
      }
      await assertInScope(authz, permissions.SLIS_REVIEW_SUBMIT, {
        organisationId: record.schemeId,
      });
    }

    return runInTransaction(
      async (tx) => {
        const submittedIds = await this.reviewRepo.submitRecords(
          entity,
          input.recordIds,
          actorUserId,
          tx,
        );

        return {
          submitted: submittedIds,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: `slis.${entity}`,
          entityId: input.recordIds[0] ?? actorUserId,
          after: { recordIds: input.recordIds, status: 'submitted' },
        },
      },
    );
  }

  async approveRecord(
    entity: string,
    id: string,
    version: number | undefined,
    input: ApproveRecordInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_REVIEW_APPROVE);
    const existing = await this.reviewRepo.findRecord(entity, id, scope);
    if (!existing) {
      throw new NotFoundException(`Record ${id} of type ${entity} not found`);
    }

    await assertInScope(authz, permissions.SLIS_REVIEW_APPROVE, {
      organisationId: existing.schemeId,
    });

    if (existing.status !== 'submitted') {
      throw new BadRequestException(
        `Record ${id} cannot be approved because it is in '${existing.status}' status (expected 'submitted')`,
      );
    }

    // Separation of duty: Submitter cannot approve their own record
    if (existing.submittedBy && existing.submittedBy === actorUserId) {
      throw new ForbiddenException('Approvers cannot approve records they submitted');
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.reviewRepo.approveRecord(entity, id, version, actorUserId, tx);

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Record ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        // Outbox events
        if (entity === 'farmer') {
          await enqueueOutboxEvent(tx, {
            eventType: 'slis.farmer.approved',
            aggregateType: 'farmer',
            aggregateId: id,
            payload: {
              farmerId: id,
              schemeId: updated.schemeId,
              approvedBy: actorUserId,
            },
          });
        } else if (entity === 'plot') {
          await enqueueOutboxEvent(tx, {
            eventType: 'slis.plot.approved',
            aggregateType: 'plot',
            aggregateId: id,
            payload: {
              plotId: id,
              schemeId: updated.schemeId,
              approvedBy: actorUserId,
            },
          });
        }

        return updated;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'approve',
          entity: `slis.${entity}`,
          entityId: id,
          after: { status: 'approved', comment: input.comment },
        },
      },
    );
  }

  async returnRecord(
    entity: string,
    id: string,
    version: number | undefined,
    input: ReturnRecordInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_REVIEW_APPROVE);
    const existing = await this.reviewRepo.findRecord(entity, id, scope);
    if (!existing) {
      throw new NotFoundException(`Record ${id} of type ${entity} not found`);
    }

    await assertInScope(authz, permissions.SLIS_REVIEW_APPROVE, {
      organisationId: existing.schemeId,
    });

    if (existing.status !== 'submitted') {
      throw new BadRequestException(
        `Record ${id} cannot be returned because it is in '${existing.status}' status (expected 'submitted')`,
      );
    }

    if (!input.comment || input.comment.trim().length === 0) {
      throw new BadRequestException('A comment explaining the return reason is required');
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.reviewRepo.returnRecord(
          entity,
          id,
          version,
          actorUserId,
          input.comment.trim(),
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Record ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        if (entity === 'farmer') {
          await enqueueOutboxEvent(tx, {
            eventType: 'slis.farmer.returned',
            aggregateType: 'farmer',
            aggregateId: id,
            payload: {
              farmerId: id,
              schemeId: updated.schemeId,
              returnedBy: actorUserId,
              returnComment: input.comment.trim(),
            },
          });
        }

        return updated;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'return',
          entity: `slis.${entity}`,
          entityId: id,
          after: { status: 'returned', returnComment: input.comment.trim() },
        },
      },
    );
  }

  async bulkApprove(
    input: BulkApproveInput,
    authz: UserAuthz,
    actorUserId: string,
  ): Promise<BulkApproveResponse> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; entity: string; reason: string }> = [];

    for (const item of input.items) {
      try {
        await this.approveRecord(item.entity, item.id, undefined, {}, authz, actorUserId);
        succeeded.push(item.id);
      } catch (err: unknown) {
        const error = err as Error;
        failed.push({
          id: item.id,
          entity: item.entity,
          reason: error.message || 'Approval failed',
        });
      }
    }

    return {
      succeeded,
      failed,
    };
  }
}
