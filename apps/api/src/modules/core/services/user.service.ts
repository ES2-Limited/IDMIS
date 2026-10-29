import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { CreateAppUserInput, ListAppUsersQuery, UpdateAppUserInput } from '@idmis/contracts';
import { UserRepository } from '../repositories/user.repository';
import { runInTransaction } from '../../../platform/database/transaction.helper';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  private sanitizeUser(user: Record<string, unknown>) {
    const copy = { ...user };
    delete copy.passwordHash;
    delete copy.totpSecretEnc;
    return copy;
  }

  async listUsers(query: ListAppUsersQuery) {
    const result = await this.userRepo.listUsers({
      cursor: query.cursor ?? undefined,
      limit: query.limit,
      isActive: query.isActive,
      roleId: query.roleId,
      search: query.search,
    });
    return {
      items: result.items.map((u) => this.sanitizeUser(u as Record<string, unknown>)),
      nextCursor: result.nextCursor,
    };
  }

  async getUser(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const roles = await this.userRepo.getUserRoles(id);
    return {
      ...this.sanitizeUser(user as Record<string, unknown>),
      roles,
    };
  }

  async createUser(input: CreateAppUserInput, actorUserId: string) {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictException(`User with email ${input.email} already exists`);
    }

    const userId = input.id ?? crypto.randomUUID();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const created = await runInTransaction(
      async (tx) => {
        return this.userRepo.create(
          {
            id: userId,
            email: input.email,
            username: input.username,
            fullName: input.fullName,
            phone: input.phone,
            passwordHash,
            isActive: input.isActive,
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
          entity: 'core.app_user',
          entityId: userId,
          after: { email: input.email, fullName: input.fullName, isActive: input.isActive },
        },
      },
    );

    return this.sanitizeUser(created as Record<string, unknown>);
  }

  async updateUser(
    id: string,
    expectedVersion: number,
    input: UpdateAppUserInput,
    actorUserId: string,
  ) {
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (input.email && input.email.toLowerCase().trim() !== existing.email) {
      const emailTaken = await this.userRepo.findByEmail(input.email);
      if (emailTaken) {
        throw new ConflictException(`User with email ${input.email} already exists`);
      }
    }

    const updated = await runInTransaction(
      async (tx) => {
        return this.userRepo.update(
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
          entity: 'core.app_user',
          entityId: id,
          before: existing,
          after: { ...existing, ...input },
        },
      },
    );

    return this.sanitizeUser(updated as Record<string, unknown>);
  }

  async deactivateUser(id: string, actorUserId: string) {
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return runInTransaction(
      async (tx) => {
        const deleted = await this.userRepo.softDelete(id, actorUserId, tx);
        return deleted;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'delete',
          entity: 'core.app_user',
          entityId: id,
          before: existing,
          after: null,
        },
      },
    );
  }
}
