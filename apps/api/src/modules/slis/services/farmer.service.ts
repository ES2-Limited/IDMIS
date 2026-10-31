import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CheckFarmerDuplicatesInput,
  type CreateFarmerIdentityInput,
  type CreateFarmerInput,
  type ListFarmersQuery,
  type UpdateFarmerInput,
} from '@idmis/contracts';
import { FarmerRepository } from '../repositories/farmer.repository';
import { EncryptionService } from '../../../platform/security/encryption.service';
import { IdentityHashService } from '../../../platform/security/identity-hash.service';
import {
  assertInScope,
  deriveLocationServerSide,
  isLocationInScope,
  type UserAuthz,
} from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import { ConflictProblemException } from '../../../platform/filters';

@Injectable()
export class FarmerService {
  constructor(
    private readonly farmerRepo: FarmerRepository,
    private readonly encryptionService: EncryptionService,
    private readonly identityHashService: IdentityHashService,
  ) {}

  async listFarmers(query: ListFarmersQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FARMER_READ);
    const result = await this.farmerRepo.listFarmers(scope, query);
    return result;
  }

  async getFarmer(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FARMER_READ);
    const farmerRow = await this.farmerRepo.findById(id, scope);
    if (!farmerRow) {
      throw new NotFoundException(`Farmer ${id} not found`);
    }

    const identityRows = await this.farmerRepo.listIdentities(id);
    const canViewUnmasked = authz.can(permissions.SLIS_IDENTITY_VIEW);

    const identities = identityRows.map((r) => {
      const base = {
        id: r.id,
        farmerId: r.farmerId,
        documentTypeId: r.documentTypeId,
        numberLast4: r.numberLast4,
        bankName: r.bankName,
        documentFileId: r.documentFileId,
        uniquePerPerson: r.uniquePerPerson,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };

      if (canViewUnmasked) {
        return {
          ...base,
          number: this.encryptionService.decrypt(Buffer.from(r.numberEnc, 'hex')),
        };
      }

      return base;
    });

    return {
      ...farmerRow,
      identities,
    };
  }

  async createFarmer(input: CreateFarmerInput, authz: UserAuthz, actorUserId: string) {
    // 1. Server-side location validation & derivation
    const derived = await deriveLocationServerSide({
      wardId: input.wardId,
      organisationId: input.schemeId,
    });

    // 2. Assert create location is within user's scope
    await assertInScope(authz, permissions.SLIS_FARMER_CREATE, {
      wardId: input.wardId,
      organisationId: input.schemeId,
    });

    const farmerId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.farmerRepo.create(
          {
            id: farmerId,
            schemeId: input.schemeId,
            sectorId: input.sectorId ?? null,
            farmerCode: input.farmerCode,
            firstName: input.firstName,
            lastName: input.lastName,
            otherNames: input.otherNames ?? null,
            gender: input.gender,
            birthYear: input.birthYear ?? null,
            phone: input.phone ?? null,
            village: input.village ?? null,
            wardId: input.wardId ?? null,
            stateId: derived.effectiveStateId ?? null,
            householdId: input.householdId ?? null,
            unitWuaId: input.unitWuaId ?? null,
            farmerGroupId: input.farmerGroupId ?? null,
            maritalStatusId: input.maritalStatusId ?? null,
            nextOfKinName: input.nextOfKinName ?? null,
            nextOfKinPhone: input.nextOfKinPhone ?? null,
            nextOfKinRelation: input.nextOfKinRelation ?? null,
            photoFileId: input.photoFileId ?? null,
            location: input.location ?? null,
            status: (input as { status?: import('@idmis/contracts').RecordStatus }).status,
            importBatchId: (input as { importBatchId?: string | null }).importBatchId,
            submittedBy: (input as { submittedBy?: string | null }).submittedBy,
            submittedAt: (input as { submittedAt?: string | null }).submittedAt,
            createdBy: actorUserId,
          },
          tx,
        );

        const createdIdentities = [];
        if (input.identities && input.identities.length > 0) {
          for (const idInput of input.identities) {
            const isUnique = await this.farmerRepo.isDocumentTypeUniquePerPerson(
              idInput.documentTypeId,
              tx,
            );
            const numberEnc = this.encryptionService.encrypt(idInput.number).toString('hex');
            const numberHash = this.identityHashService.hash(idInput.number);
            const numberLast4 = this.identityHashService.last4(idInput.number);

            const identity = await this.farmerRepo.addIdentity(
              {
                id: idInput.id,
                farmerId: created.id,
                documentTypeId: idInput.documentTypeId,
                numberEnc,
                numberHash,
                numberLast4,
                bankName: idInput.bankName ?? null,
                documentFileId: idInput.documentFileId ?? null,
                uniquePerPerson: isUnique,
                createdBy: actorUserId,
              },
              tx,
            );

            createdIdentities.push({
              id: identity.id,
              farmerId: identity.farmerId,
              documentTypeId: identity.documentTypeId,
              numberLast4: identity.numberLast4,
              bankName: identity.bankName,
              documentFileId: identity.documentFileId,
              uniquePerPerson: identity.uniquePerPerson,
              version: identity.version,
              createdAt: identity.createdAt,
              updatedAt: identity.updatedAt,
            });
          }
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farmer.created',
          aggregateType: 'farmer',
          aggregateId: created.id,
          payload: {
            farmerId: created.id,
            farmerCode: created.farmerCode,
            schemeId: created.schemeId,
            stateId: created.stateId,
            createdBy: actorUserId,
          },
        });

        return {
          ...created,
          identities: createdIdentities,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.farmer',
          entityId: farmerId,
          stateId: derived.effectiveStateId,
          after: {
            ...input,
            identities: input.identities?.map((id) => ({
              ...id,
              number: this.identityHashService.mask(id.number),
            })),
          },
        },
      },
    );
  }

  async updateFarmer(
    id: string,
    version: number,
    input: UpdateFarmerInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const existing = await this.farmerRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Farmer ${id} not found`);
    }

    // Assert existing record is in user's scope
    await assertInScope(authz, permissions.SLIS_FARMER_UPDATE, {
      wardId: existing.wardId,
      organisationId: existing.schemeId,
    });

    let effectiveStateId = existing.stateId;
    if (input.wardId && input.wardId !== existing.wardId) {
      const derived = await deriveLocationServerSide({
        wardId: input.wardId,
        organisationId: existing.schemeId,
      });
      await assertInScope(authz, permissions.SLIS_FARMER_UPDATE, {
        wardId: input.wardId,
        organisationId: existing.schemeId,
      });
      effectiveStateId = derived.effectiveStateId ?? effectiveStateId;
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.farmerRepo.update(
          id,
          version,
          {
            ...input,
            stateId: effectiveStateId,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!updated) {
          throw new ConflictProblemException({
            detail: 'Farmer was modified by another user. Please reload and try again.',
            current: existing,
            currentVersion: existing.version,
          });
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farmer.updated',
          aggregateType: 'farmer',
          aggregateId: updated.id,
          payload: {
            farmerId: updated.id,
            farmerCode: updated.farmerCode,
            schemeId: updated.schemeId,
            stateId: updated.stateId,
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
          entity: 'slis.farmer',
          entityId: id,
          stateId: effectiveStateId ?? undefined,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );
  }

  /**
   * Privacy-preserving duplicate detection.
   * Matches candidates, but only returns full details for records in the user's scope.
   * Out-of-scope matches return COUNT ONLY to prevent leaking data across schemes/states.
   */
  async checkDuplicates(input: CheckFarmerDuplicatesInput, authz: UserAuthz) {
    const readScope = authz.scopeFor(permissions.SLIS_FARMER_READ);

    let identityHashes: string[] | undefined;
    if (input.identityNumber && input.identityNumber.trim().length > 0) {
      identityHashes = this.identityHashService.findCandidates(input.identityNumber);
    }

    const candidates = await this.farmerRepo.findDuplicateCandidates({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      wardId: input.wardId,
      identityHashes,
      documentTypeId: input.documentTypeId,
    });

    const inScopeMatches = [];
    let outOfScopeMatchesCount = 0;

    for (const c of candidates) {
      const inScope = isLocationInScope(readScope, {
        effectiveStateId: c.stateId ?? undefined,
        schemeId: c.schemeId,
        orgStateIds: c.stateId ? [c.stateId] : [],
        organisationType: 'scheme',
      });

      if (inScope) {
        inScopeMatches.push({
          id: c.id,
          farmerCode: c.farmerCode,
          firstName: c.firstName,
          lastName: c.lastName,
          village: c.village,
          wardId: c.wardId,
          schemeId: c.schemeId,
        });
      } else {
        outOfScopeMatchesCount++;
      }
    }

    return {
      hasDuplicate: inScopeMatches.length > 0 || outOfScopeMatchesCount > 0,
      inScopeMatches,
      outOfScopeMatchesCount,
    };
  }

  // --- Identity Sub-Resource Methods ---

  async addIdentity(
    farmerId: string,
    input: CreateFarmerIdentityInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const farmerRow = await this.farmerRepo.findById(farmerId);
    if (!farmerRow) {
      throw new NotFoundException(`Farmer ${farmerId} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FARMER_UPDATE, {
      wardId: farmerRow.wardId,
      organisationId: farmerRow.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const isUnique = await this.farmerRepo.isDocumentTypeUniquePerPerson(
          input.documentTypeId,
          tx,
        );
        const numberEnc = this.encryptionService.encrypt(input.number).toString('hex');
        const numberHash = this.identityHashService.hash(input.number);
        const numberLast4 = this.identityHashService.last4(input.number);

        const created = await this.farmerRepo.addIdentity(
          {
            id: input.id,
            farmerId,
            documentTypeId: input.documentTypeId,
            numberEnc,
            numberHash,
            numberLast4,
            bankName: input.bankName ?? null,
            documentFileId: input.documentFileId ?? null,
            uniquePerPerson: isUnique,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farmer.updated',
          aggregateType: 'farmer',
          aggregateId: farmerId,
          payload: {
            farmerId,
            identityId: created.id,
            action: 'identity_added',
          },
        });

        return {
          id: created.id,
          farmerId: created.farmerId,
          documentTypeId: created.documentTypeId,
          numberLast4: created.numberLast4,
          bankName: created.bankName,
          documentFileId: created.documentFileId,
          uniquePerPerson: created.uniquePerPerson,
          version: created.version,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.farmer',
          entityId: farmerId,
          stateId: farmerRow.stateId ?? undefined,
          after: {
            identityAdded: {
              documentTypeId: input.documentTypeId,
              number: this.identityHashService.mask(input.number),
            },
          },
        },
      },
    );
  }

  async getIdentities(farmerId: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_FARMER_READ);
    const farmerRow = await this.farmerRepo.findById(farmerId, scope);
    if (!farmerRow) {
      throw new NotFoundException(`Farmer ${farmerId} not found`);
    }

    const rows = await this.farmerRepo.listIdentities(farmerId);
    const canViewUnmasked = authz.can(permissions.SLIS_IDENTITY_VIEW);

    return rows.map((r) => {
      const base = {
        id: r.id,
        farmerId: r.farmerId,
        documentTypeId: r.documentTypeId,
        numberLast4: r.numberLast4,
        bankName: r.bankName,
        documentFileId: r.documentFileId,
        uniquePerPerson: r.uniquePerPerson,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };

      if (canViewUnmasked) {
        return {
          ...base,
          number: this.encryptionService.decrypt(Buffer.from(r.numberEnc, 'hex')),
        };
      }

      return base;
    });
  }

  async deleteIdentity(
    farmerId: string,
    identityId: string,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const farmerRow = await this.farmerRepo.findById(farmerId);
    if (!farmerRow) {
      throw new NotFoundException(`Farmer ${farmerId} not found`);
    }

    await assertInScope(authz, permissions.SLIS_FARMER_UPDATE, {
      wardId: farmerRow.wardId,
      organisationId: farmerRow.schemeId,
    });

    return runInTransaction(
      async (tx) => {
        const deleted = await this.farmerRepo.deleteIdentity(identityId, farmerId, tx);
        if (!deleted) {
          throw new NotFoundException(`Identity ${identityId} not found`);
        }

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.farmer.updated',
          aggregateType: 'farmer',
          aggregateId: farmerId,
          payload: {
            farmerId,
            identityId,
            action: 'identity_removed',
          },
        });

        return { success: true };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'slis.farmer',
          entityId: farmerId,
          stateId: farmerRow.stateId ?? undefined,
          after: { identityRemoved: identityId },
        },
      },
    );
  }
}
