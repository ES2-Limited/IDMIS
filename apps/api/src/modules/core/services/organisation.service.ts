import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  UpdateOrganisationInput,
} from '@idmis/contracts';
import { OrganisationRepository } from '../repositories/organisation.repository';
import { runInTransaction } from '../../../platform/database/transaction.helper';

@Injectable()
export class OrganisationService {
  constructor(private readonly orgRepo: OrganisationRepository) {}

  async listOrganisations(query: ListOrganisationsQuery) {
    return this.orgRepo.listOrganisations({
      type: query.type,
      parentId: query.parentId,
      stateId: query.stateId,
      isActive: query.isActive,
    });
  }

  async getOrganisation(id: string) {
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundException(`Organisation ${id} not found`);
    }
    return org;
  }

  async createOrganisation(input: CreateOrganisationInput, actorUserId: string) {
    if (input.parentId) {
      const parent = await this.orgRepo.findById(input.parentId);
      if (!parent) {
        throw new NotFoundException(`Parent organisation ${input.parentId} not found`);
      }
    }

    return runInTransaction(
      async (tx) => {
        return this.orgRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'core.organisation',
          after: input,
        },
      },
    );
  }

  async updateOrganisation(
    id: string,
    expectedVersion: number,
    input: UpdateOrganisationInput,
    actorUserId: string,
  ) {
    const existing = await this.orgRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Organisation ${id} not found`);
    }

    if (input.parentId) {
      const parent = await this.orgRepo.findById(input.parentId);
      if (!parent) {
        throw new NotFoundException(`Parent organisation ${input.parentId} not found`);
      }
    }

    return runInTransaction(
      async (tx) => {
        return this.orgRepo.update(
          id,
          expectedVersion,
          {
            ...input,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'core.organisation',
          entityId: id,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }
}
