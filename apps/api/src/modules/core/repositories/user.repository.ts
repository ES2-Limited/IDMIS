import { and, desc, eq, gt, ilike, inArray, isNull, or, type SQL } from '@idmis/db';
import { appUser, assignment, db, role } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import { ConflictProblemException } from '../../../platform/filters';

export interface ListUsersFilter {
  cursor?: string;
  limit?: number;
  isActive?: boolean;
  roleId?: string;
  search?: string;
}

export interface CreateUserData {
  id?: string;
  email: string;
  username?: string | null;
  fullName: string;
  phone?: string | null;
  passwordHash: string;
  isActive?: boolean;
  createdBy?: string;
}

export interface UpdateUserData {
  email?: string;
  username?: string | null;
  fullName?: string;
  phone?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
  updatedBy?: string;
}

@Injectable()
export class UserRepository {
  async listUsers(filters: ListUsersFilter = {}, txDb: DatabaseOrTx = db) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(appUser.deletedAt)];

    if (filters.isActive !== undefined) {
      conditions.push(eq(appUser.isActive, filters.isActive));
    }

    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(or(ilike(appUser.fullName, pattern), ilike(appUser.email, pattern))!);
    }

    if (filters.cursor) {
      conditions.push(gt(appUser.id, filters.cursor));
    }

    if (filters.roleId) {
      const userAssignments = await txDb
        .select({ userId: assignment.userId })
        .from(assignment)
        .where(and(eq(assignment.roleId, filters.roleId), isNull(assignment.deletedAt)));
      const userIds = userAssignments.map((a) => a.userId);
      if (userIds.length === 0) {
        return { items: [], nextCursor: null };
      }
      conditions.push(inArray(appUser.id, userIds));
    }

    const rows = await txDb
      .select()
      .from(appUser)
      .where(and(...conditions))
      .orderBy(appUser.id)
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return { items, nextCursor };
  }

  async findById(id: string, txDb: DatabaseOrTx = db) {
    const [user] = await txDb
      .select()
      .from(appUser)
      .where(and(eq(appUser.id, id), isNull(appUser.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  async findByEmail(email: string, txDb: DatabaseOrTx = db) {
    const [user] = await txDb
      .select()
      .from(appUser)
      .where(and(eq(appUser.email, email.toLowerCase().trim()), isNull(appUser.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  async create(data: CreateUserData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [created] = await txDb
      .insert(appUser)
      .values({
        id: data.id ?? crypto.randomUUID(),
        email: data.email.toLowerCase().trim(),
        username: data.username ?? null,
        fullName: data.fullName,
        phone: data.phone ?? null,
        passwordHash: data.passwordHash,
        isActive: data.isActive ?? true,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();
    return created;
  }

  async update(id: string, expectedVersion: number, data: UpdateUserData, txDb: DatabaseOrTx = db) {
    const updatePayload: Record<string, unknown> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    if (data.email) {
      updatePayload.email = data.email.toLowerCase().trim();
    }

    const [updated] = await txDb
      .update(appUser)
      .set(updatePayload)
      .where(
        and(eq(appUser.id, id), eq(appUser.version, expectedVersion), isNull(appUser.deletedAt)),
      )
      .returning();

    if (!updated) {
      const existing = await txDb.select().from(appUser).where(eq(appUser.id, id)).limit(1);
      throw new ConflictProblemException({
        detail: 'User record version mismatch or user not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }
    return updated;
  }

  async softDelete(id: string, deletedBy: string, txDb: DatabaseOrTx = db) {
    const [deleted] = await txDb
      .update(appUser)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(appUser.id, id), isNull(appUser.deletedAt)))
      .returning();
    return deleted ?? null;
  }

  async getUserRoles(userId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select({
        assignmentId: assignment.id,
        roleId: role.id,
        roleCode: role.key,
        roleName: role.name,
        module: assignment.module,
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
      })
      .from(assignment)
      .innerJoin(role, eq(assignment.roleId, role.id))
      .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)))
      .orderBy(desc(assignment.createdAt));
  }
}
