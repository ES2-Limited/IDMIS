import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { permissions } from '@idmis/contracts';
import {
  FeeRepository,
  type CreateFeeBillingData,
  type UpdateFeeBillingData,
  type CreateFeeCollectionData,
} from '../repositories/fee.repository';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class FeeService {
  constructor(private readonly feeRepo: FeeRepository) {}

  async createBilling(input: CreateFeeBillingData, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: input.schemeId,
    });

    const billingId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.feeRepo.createBilling(
          {
            ...input,
            id: billingId,
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
    input: UpdateFeeBillingData,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.feeRepo.findBillingById(id);
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

    return runInTransaction(
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
  }

  async createCollection(input: CreateFeeCollectionData, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: input.schemeId,
    });

    const collectionId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        // Receipt number must be unique
        const existingReceipt = await this.feeRepo.findCollectionByReceiptNo(input.receiptNo, tx);
        if (existingReceipt) {
          throw new BadRequestException(`Duplicate receipt number '${input.receiptNo}'`);
        }

        // Must reference a valid billing row
        const billing = await this.feeRepo.findBillingById(input.billingId, tx);
        if (!billing) {
          throw new BadRequestException(`Billing record with id '${input.billingId}' not found`);
        }

        const colAmount = parseFloat(input.amountNgn);
        if (isNaN(colAmount) || colAmount <= 0) {
          throw new BadRequestException('Collection amount must be greater than 0');
        }

        const billedAmount = parseFloat(billing.amountNgn);
        const existingCollections = await this.feeRepo.listCollectionsByBillingId(
          input.billingId,
          tx,
        );
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
          after: input,
        },
      },
    );
  }

  async deleteCollection(id: string, authz: UserAuthz, actorUserId: string) {
    const existing = await this.feeRepo.findCollectionById(id);
    if (!existing) {
      throw new NotFoundException(`Fee collection ${id} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FEE_RECORD, {
      organisationId: existing.schemeId,
    });

    return runInTransaction(
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
