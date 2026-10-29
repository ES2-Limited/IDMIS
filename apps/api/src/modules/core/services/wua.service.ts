import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type CreateWuaInput,
  type CreateWuaOfficerInput,
  type ListWuasQuery,
  type UpdateWuaInput,
} from '@idmis/contracts';
import { WuaRepository } from '../repositories/wua.repository';
import { EncryptionService } from '../../../platform/security/encryption.service';
import { assertInScope, deriveLocationServerSide, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';

@Injectable()
export class WuaService {
  constructor(
    private readonly wuaRepo: WuaRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  async listWuas(query: ListWuasQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.CORE_WUA_READ);
    const result = await this.wuaRepo.listWuas(scope, {
      cursor: query.cursor ?? undefined,
      limit: query.limit,
      level: query.level,
      organisationId: query.organisationId,
      isOperational: query.isOperational,
    });

    const items = result.items.map((row) => ({
      ...row,
      bankAccountLast4: row.bankAccountEnc
        ? this.encryptionService.maskAccount(
            this.encryptionService.decrypt(Buffer.from(row.bankAccountEnc)),
          )
        : null,
      bankAccountEnc: undefined,
    }));

    return { items, nextCursor: result.nextCursor };
  }

  async getWua(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.CORE_WUA_READ);
    const wuaRow = await this.wuaRepo.findById(id, scope);
    if (!wuaRow) {
      throw new NotFoundException(`WUA ${id} not found`);
    }

    const officers = await this.wuaRepo.listOfficers(id);

    return {
      ...wuaRow,
      bankAccountLast4: wuaRow.bankAccountEnc
        ? this.encryptionService.maskAccount(
            this.encryptionService.decrypt(Buffer.from(wuaRow.bankAccountEnc)),
          )
        : null,
      bankAccountEnc: undefined,
      officers,
    };
  }

  async createWua(input: CreateWuaInput, authz: UserAuthz, actorUserId: string) {
    // 1. Server-side location derivation (validates ward and org agree on state; throws 422 on mismatch)
    const derived = await deriveLocationServerSide({
      wardId: input.wardId,
      organisationId: input.organisationId,
    });

    // 2. Assert create location is within user's scope (throws 403 on unscoped location)
    await assertInScope(authz, permissions.CORE_WUA_MANAGE, {
      wardId: input.wardId,
      organisationId: input.organisationId,
    });

    // 3. Encrypt bank account number if supplied
    const bankAccountEnc = input.bankAccountNumber
      ? this.encryptionService.encrypt(input.bankAccountNumber)
      : null;

    return runInTransaction(
      async (tx) => {
        const created = await this.wuaRepo.create(
          {
            id: input.id,
            level: input.level,
            parentId: input.parentId ?? null,
            organisationId: input.organisationId,
            wardId: input.wardId ?? null,
            stateId: derived.effectiveStateId ?? null,
            regNo: input.regNo ?? null,
            name: input.name,
            address: input.address ?? null,
            bankName: input.bankName ?? null,
            bankAccountEnc,
            isOperational: input.isOperational ?? false,
            hasMaintenanceFund: input.hasMaintenanceFund ?? false,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'core.wua.created',
          aggregateType: 'wua',
          aggregateId: created.id,
          payload: {
            wuaId: created.id,
            name: created.name,
            level: created.level,
            stateId: created.stateId,
            organisationId: created.organisationId,
            createdBy: actorUserId,
          },
        });

        return {
          ...created,
          bankAccountLast4: this.encryptionService.maskAccount(input.bankAccountNumber),
          bankAccountEnc: undefined,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'core.wua',
          stateId: derived.effectiveStateId,
          after: { ...input, bankAccountNumber: undefined },
        },
      },
    );
  }

  async updateWua(
    id: string,
    expectedVersion: number,
    input: UpdateWuaInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    // 1. Existing record check using user's scope (throws 404 if out of scope)
    const scope = authz.scopeFor(permissions.CORE_WUA_MANAGE);
    const existing = await this.wuaRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`WUA ${id} not found`);
    }

    // Assert existing location in scope
    await assertInScope(authz, permissions.CORE_WUA_MANAGE, {
      wardId: existing.wardId,
      organisationId: existing.organisationId,
    });

    // 2. If changing location (ward or organisation), derive and assert new location in scope
    const targetWardId = input.wardId !== undefined ? input.wardId : existing.wardId;
    const targetOrgId =
      input.organisationId !== undefined ? input.organisationId : existing.organisationId;

    let newStateId = existing.stateId;
    if (input.wardId !== undefined || input.organisationId !== undefined) {
      const derived = await deriveLocationServerSide({
        wardId: targetWardId,
        organisationId: targetOrgId,
      });
      newStateId = derived.effectiveStateId ?? null;

      await assertInScope(authz, permissions.CORE_WUA_MANAGE, {
        wardId: targetWardId,
        organisationId: targetOrgId,
      });
    }

    // 3. Encrypt updated bank account if supplied
    let bankAccountEnc: Buffer | undefined;
    if (input.bankAccountNumber !== undefined) {
      bankAccountEnc = input.bankAccountNumber
        ? this.encryptionService.encrypt(input.bankAccountNumber)
        : (null as unknown as Buffer);
    }

    return runInTransaction(
      async (tx) => {
        const updated = await this.wuaRepo.update(
          id,
          expectedVersion,
          {
            ...input,
            stateId: newStateId,
            bankAccountEnc,
            updatedBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'core.wua.updated',
          aggregateType: 'wua',
          aggregateId: id,
          payload: {
            wuaId: id,
            name: updated.name,
            stateId: updated.stateId,
            updatedBy: actorUserId,
          },
        });

        return {
          ...updated,
          bankAccountLast4:
            input.bankAccountNumber !== undefined
              ? this.encryptionService.maskAccount(input.bankAccountNumber)
              : existing.bankAccountEnc
                ? this.encryptionService.maskAccount(
                    this.encryptionService.decrypt(Buffer.from(existing.bankAccountEnc)),
                  )
                : null,
          bankAccountEnc: undefined,
        };
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'core.wua',
          entityId: id,
          stateId: newStateId ?? undefined,
          before: { ...existing, bankAccountEnc: undefined },
          after: { ...existing, ...input, bankAccountNumber: undefined },
        },
      },
    );
  }

  // --- Officers ---

  async addOfficer(
    wuaId: string,
    input: CreateWuaOfficerInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.CORE_WUA_MANAGE);
    const existing = await this.wuaRepo.findById(wuaId, scope);
    if (!existing) {
      throw new NotFoundException(`WUA ${wuaId} not found`);
    }

    await assertInScope(authz, permissions.CORE_WUA_MANAGE, {
      wardId: existing.wardId,
      organisationId: existing.organisationId,
    });

    return runInTransaction(
      async (tx) => {
        return this.wuaRepo.createOfficer(
          {
            ...input,
            wuaId,
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
          entity: 'core.wua_officer',
          stateId: existing.stateId ?? undefined,
          after: input,
        },
      },
    );
  }

  async removeOfficer(wuaId: string, officerId: string, authz: UserAuthz, actorUserId: string) {
    const scope = authz.scopeFor(permissions.CORE_WUA_MANAGE);
    const existing = await this.wuaRepo.findById(wuaId, scope);
    if (!existing) {
      throw new NotFoundException(`WUA ${wuaId} not found`);
    }

    await assertInScope(authz, permissions.CORE_WUA_MANAGE, {
      wardId: existing.wardId,
      organisationId: existing.organisationId,
    });

    return runInTransaction(
      async (tx) => {
        return this.wuaRepo.softDeleteOfficer(wuaId, officerId, actorUserId, tx);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'delete',
          entity: 'core.wua_officer',
          entityId: officerId,
          stateId: existing.stateId ?? undefined,
          before: { wuaId, officerId },
          after: null,
        },
      },
    );
  }
}
