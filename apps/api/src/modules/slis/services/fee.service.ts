import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  permissions,
  type ListFeeBillingsQuery,
  type ListFeeCollectionsQuery,
} from '@idmis/contracts';
import {
  FeeRepository,
  type CreateFeeBillingData,
  type UpdateFeeBillingData,
  type CreateFeeCollectionData,
  type UpdateFeeCollectionData,
} from '../repositories/fee.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';
import { eventBus } from '../../../platform/events/event-bus';
import crypto from 'node:crypto';

@Injectable()
export class FeeService {
  constructor(private readonly feeRepo: FeeRepository) {}

  async listBillings(query: ListFeeBillingsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_READ);
    return this.feeRepo.listBillings(scope, query);
  }

  async getBilling(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_READ);
    const existing = await this.feeRepo.findBillingById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Fee billing ${id} not found`);
    }
    return existing;
  }

  async createBilling(input: CreateFeeBillingData, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: input.schemeId,
    });

    if ((input.wuaId && input.farmerId) || (!input.wuaId && !input.farmerId)) {
      throw new BadRequestException('Exactly one of wuaId or farmerId must be provided');
    }

    const billingId = input.id ?? crypto.randomUUID();
    const dueDate = input.dueDate ?? new Date().toISOString().slice(0, 10);

    return runInTransaction(
      async (tx) => {
        const created = await this.feeRepo.createBilling(
          {
            ...input,
            id: billingId,
            dueDate,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.fee_billing.created',
          aggregateType: 'fee_billing',
          aggregateId: created.id,
          payload: {
            billingId: created.id,
            schemeId: created.schemeId,
            seasonId: created.seasonId,
            amountNgn: created.amountNgn,
            createdBy: actorUserId,
          },
        });

        return created;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.fee_billing',
          entityId: billingId,
          after: input,
        },
      },
    );
  }

  async updateBilling(
    id: string,
    version: number,
    input: Partial<UpdateFeeBillingData>,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_RECORD);
    const existing = await this.feeRepo.findBillingById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Fee billing ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: existing.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const updated = await this.feeRepo.updateBilling(
          id,
          version,
          {
            ...input,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: `Fee billing ${id} was modified concurrently`,
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.fee_billing.updated',
          aggregateType: 'fee_billing',
          aggregateId: id,
          payload: {
            billingId: id,
            schemeId: existing.schemeId,
            updatedBy: actorUserId,
          },
        });

        return updated;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.fee_billing',
          entityId: id,
          before: existing,
          after: input,
        },
      },
    );
  }

  async deleteBilling(id: string, authz: UserAuthz, actorUserId: string) {
    const existing = await this.feeRepo.findBillingById(id);
    if (!existing) {
      throw new NotFoundException(`Fee billing ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: existing.schemeId,
    });

    const res = await runInTransaction(
      async (tx) => {
        const collections = await this.feeRepo.listCollectionsByBillingId(id, tx);
        if (collections.length > 0) {
          throw new BadRequestException(
            `Cannot delete fee billing ${id}: active fee collections exist`,
          );
        }

        const deleted = await this.feeRepo.softDeleteBilling(id, actorUserId, tx);

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.fee_billing.deleted',
          aggregateType: 'fee_billing',
          aggregateId: id,
          payload: {
            billingId: id,
            schemeId: existing.schemeId,
            deletedBy: actorUserId,
          },
        });

        return deleted;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'delete',
          entity: 'slis.fee_billing',
          entityId: id,
          before: existing,
        },
      },
    );

    eventBus.emitRecompute({ schemeId: existing.schemeId });
    return res;
  }

  async listCollections(query: ListFeeCollectionsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_READ);
    return this.feeRepo.listCollections(scope, query);
  }

  async getCollection(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_READ);
    const existing = await this.feeRepo.findCollectionById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Fee collection ${id} not found`);
    }
    return existing;
  }

  async createCollection(
    input: Partial<CreateFeeCollectionData> & {
      schemeId: string;
      seasonId: string;
      amountNgn: string;
      paidOn: string;
    },
    authz: UserAuthz,
    actorUserId: string,
  ) {
    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: input.schemeId,
    });

    if ((input.wuaId && input.farmerId) || (!input.wuaId && !input.farmerId)) {
      throw new BadRequestException('Exactly one of wuaId or farmerId must be provided');
    }

    const collectionId = input.id ?? crypto.randomUUID();
    const receiptNo =
      input.receiptNo ||
      `REC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    try {
      return await runInTransaction(
        async (tx) => {
          // Receipt number must be unique
          const existingReceipt = await this.feeRepo.findCollectionByReceiptNo(receiptNo, tx);
          if (existingReceipt) {
            throw new ConflictProblemException({
              detail: `Duplicate receipt number '${receiptNo}'`,
              code: 'DUPLICATE_RECEIPT',
              current: existingReceipt,
              currentVersion: existingReceipt.version,
            });
          }

          // Must reference a valid billing row; if not provided, find one for this farmer/wua and season
          let billingId = input.billingId;
          if (!billingId) {
            const billing = input.farmerId
              ? await this.feeRepo.findBillingByFarmerAndSeason(input.farmerId, input.seasonId, tx)
              : await this.feeRepo.findBillingByWuaAndSeason(input.wuaId!, input.seasonId, tx);
            if (!billing) {
              throw new BadRequestException(
                'Billing record not found for this farmer/wua and season',
              );
            }
            billingId = billing.id;
          }

          const billing = await this.feeRepo.findBillingById(billingId, undefined, tx);
          if (!billing) {
            throw new BadRequestException(`Billing record with id '${billingId}' not found`);
          }

          const colAmount = parseFloat(input.amountNgn);
          if (isNaN(colAmount) || colAmount <= 0) {
            throw new BadRequestException('Collection amount must be greater than 0');
          }

          const billedAmount = parseFloat(billing.amountNgn);
          const existingCollections = await this.feeRepo.listCollectionsByBillingId(billingId, tx);
          const alreadyCollected = existingCollections.reduce(
            (sum, c) => sum + parseFloat(c.amountNgn),
            0,
          );

          if (alreadyCollected + colAmount > billedAmount) {
            throw new BadRequestException(
              `Total collected amount (${(alreadyCollected + colAmount).toFixed(2)}) exceeds billed amount (${billedAmount.toFixed(2)})`,
            );
          }

          const created = await this.feeRepo.createCollection(
            {
              ...input,
              id: collectionId,
              billingId,
              receiptNo,
              createdBy: actorUserId,
            },
            tx,
          );

          await enqueueOutboxEvent(tx, {
            eventType: 'slis.fee_collection.created',
            aggregateType: 'fee_collection',
            aggregateId: created.id,
            payload: {
              collectionId: created.id,
              billingId: created.billingId,
              receiptNo: created.receiptNo,
              amountNgn: created.amountNgn,
              schemeId: created.schemeId,
              createdBy: actorUserId,
            },
          });

          return created;
        },
        {
          audit: {
            actorType: 'user',
            actorUserId,
            action: 'create',
            entity: 'slis.fee_collection',
            entityId: collectionId,
            after: { ...input, receiptNo },
          },
        },
      );
    } catch (err: unknown) {
      this.handleReceiptConflict(err);
      throw err;
    }
  }

  async updateCollection(
    id: string,
    version: number,
    input: Partial<UpdateFeeCollectionData>,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_FEE_RECORD);
    const existing = await this.feeRepo.findCollectionById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Fee collection ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: existing.schemeId,
    });

    if (input.receiptNo && input.receiptNo !== existing.receiptNo) {
      const existingReceipt = await this.feeRepo.findCollectionByReceiptNo(input.receiptNo);
      if (existingReceipt && existingReceipt.id !== id) {
        throw new ConflictProblemException({
          detail: `Duplicate receipt number '${input.receiptNo}'`,
          code: 'DUPLICATE_RECEIPT',
          current: existingReceipt,
          currentVersion: existingReceipt.version,
        });
      }
    }

    try {
      return await runInTransaction(
        async (tx) => {
          const updated = await this.feeRepo.updateCollection(
            id,
            version,
            {
              ...input,
              updatedBy: actorUserId,
            },
            tx,
          );

          if (!updated) {
            throw new ConflictProblemException({
              detail: `Fee collection ${id} was modified concurrently`,
              current: existing,
              currentVersion: existing.version,
            });
          }

          await enqueueOutboxEvent(tx, {
            eventType: 'slis.fee_collection.updated',
            aggregateType: 'fee_collection',
            aggregateId: id,
            payload: {
              collectionId: id,
              schemeId: existing.schemeId,
              updatedBy: actorUserId,
            },
          });

          return updated;
        },
        {
          audit: {
            actorType: 'user',
            actorUserId,
            action: 'update',
            entity: 'slis.fee_collection',
            entityId: id,
            before: existing,
            after: input,
          },
        },
      );
    } catch (err: unknown) {
      this.handleReceiptConflict(err);
      throw err;
    }
  }

  private handleReceiptConflict(err: unknown): void {
    if (err instanceof ConflictProblemException) {
      throw err;
    }
    const rootErr = err as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
      message?: string;
      detail?: string;
      cause?: unknown;
    };
    const cause = rootErr.cause as
      | {
          code?: string;
          constraint?: string;
          constraint_name?: string;
          message?: string;
          detail?: string;
        }
      | undefined;

    const code = cause?.code ?? rootErr.code;
    const constraint =
      cause?.constraint_name ??
      cause?.constraint ??
      rootErr.constraint_name ??
      rootErr.constraint ??
      '';
    const message = `${rootErr.message ?? ''} ${cause?.message ?? ''}`;
    const detail = `${rootErr.detail ?? ''} ${cause?.detail ?? ''}`;

    if (
      code === '23505' ||
      message.includes('23505') ||
      detail.includes('already exists') ||
      message.includes('unique constraint')
    ) {
      if (
        constraint === 'fee_collection_receipt_no_unique' ||
        constraint === 'fee_collection_device_receipt_unique' ||
        message.includes('fee_collection_receipt_no_unique') ||
        message.includes('fee_collection_device_receipt_unique') ||
        detail.includes('receipt_no') ||
        detail.includes('field_receipt_ref')
      ) {
        throw new ConflictProblemException({
          detail: `Duplicate receipt: ${cause?.detail || cause?.message || rootErr.detail || rootErr.message || 'receipt constraint violation'}`,
          code: 'DUPLICATE_RECEIPT',
          current: null,
          currentVersion: 0,
        });
      }
    }
  }

  async deleteCollection(id: string, authz: UserAuthz, actorUserId: string) {
    const existing = await this.feeRepo.findCollectionById(id);
    if (!existing) {
      throw new NotFoundException(`Fee collection ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: existing.schemeId,
    });

    const res = await runInTransaction(
      async (tx) => {
        const deleted = await this.feeRepo.softDeleteCollection(id, actorUserId, tx);

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.fee_collection.deleted',
          aggregateType: 'fee_collection',
          aggregateId: id,
          payload: {
            collectionId: id,
            schemeId: existing.schemeId,
            deletedBy: actorUserId,
          },
        });

        return deleted;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'delete',
          entity: 'slis.fee_collection',
          entityId: id,
          before: existing,
        },
      },
    );

    eventBus.emitRecompute({ schemeId: existing.schemeId });
    return res;
  }

  async findBillingById(id: string) {
    return this.feeRepo.findBillingById(id);
  }

  async findCollectionById(id: string) {
    return this.feeRepo.findCollectionById(id);
  }

  async findBillingByFarmerAndSeason(farmerId: string, seasonId: string) {
    return this.feeRepo.findBillingByFarmerAndSeason(farmerId, seasonId);
  }

  async findBillingByWuaAndSeason(wuaId: string, seasonId: string) {
    return this.feeRepo.findBillingByWuaAndSeason(wuaId, seasonId);
  }

  async findCollectionByReceiptNo(receiptNo: string) {
    return this.feeRepo.findCollectionByReceiptNo(receiptNo);
  }

  async listCollectionsByBillingId(billingId: string) {
    return this.feeRepo.listCollectionsByBillingId(billingId);
  }
}
