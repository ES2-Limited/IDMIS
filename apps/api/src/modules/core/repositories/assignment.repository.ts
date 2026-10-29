import { and, eq, gte, isNull, lte, or } from '@idmis/db';
import { appUser, assignment, db, role, rolePermission } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type { ModuleKey, ScopeType } from '@idmis/contracts';

export interface CreateAssignmentData {
  id?: string;
  userId: string;
  roleId: string;
  module: ModuleKey;
  scopeType: ScopeType;
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
  canCaptureOffline?: boolean;
  validFromOn?: string | null;
  validToOn?: string | null;
  createdBy?: string;
}

@Injectable()
export class AssignmentRepository {
  async findById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .select()
      .from(assignment)
      .where(and(eq(assignment.id, id), isNull(assignment.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async listByUser(userId: string, txDb: DatabaseOrTx = db) {
    return txDb
      .select({
        id: assignment.id,
        userId: assignment.userId,
        roleId: assignment.roleId,
        roleCode: role.key,
        roleName: role.name,
        module: assignment.module,
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
        canCaptureOffline: assignment.canCaptureOffline,
        validFromOn: assignment.validFromOn,
        validToOn: assignment.validToOn,
        createdAt: assignment.createdAt,
      })
      .from(assignment)
      .innerJoin(role, eq(assignment.roleId, role.id))
      .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)));
  }

  async create(data: CreateAssignmentData, txDb: DatabaseOrTx = db) {
    const creator = data.createdBy ?? '00000000-0000-7000-8000-000000000001';
    const [created] = await txDb
      .insert(assignment)
      .values({
        id: data.id ?? crypto.randomUUID(),
        userId: data.userId,
        roleId: data.roleId,
        module: data.module,
        scopeType: data.scopeType,
        scopeStateId: data.scopeStateId ?? null,
        scopeOrgId: data.scopeOrgId ?? null,
        canCaptureOffline: data.canCaptureOffline ?? false,
        validFromOn: data.validFromOn ?? null,
        validToOn: data.validToOn ?? null,
        createdBy: creator,
        updatedBy: creator,
      })
      .returning();
    return created;
  }

  async softDelete(id: string, deletedBy: string, txDb: DatabaseOrTx = db) {
    const [deleted] = await txDb
      .update(assignment)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(assignment.id, id), isNull(assignment.deletedAt)))
      .returning();
    return deleted ?? null;
  }

  /**
   * Retrieves all permissions granted by a role (used for anti-privilege escalation check).
   */
  async getRolePermissions(roleId: string, txDb: DatabaseOrTx = db): Promise<string[]> {
    const rows = await txDb
      .select({ permission: rolePermission.permission })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, roleId));
    return rows.map((r) => r.permission);
  }

  /**
   * Retrieves role details.
   */
  async getRoleById(roleId: string, txDb: DatabaseOrTx = db) {
    const [r] = await txDb.select().from(role).where(eq(role.id, roleId)).limit(1);
    return r ?? null;
  }

  async countActiveNationalSystemAdmins(txDb: DatabaseOrTx = db): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await txDb
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(role, eq(assignment.roleId, role.id))
      .innerJoin(appUser, eq(assignment.userId, appUser.id))
      .where(
        and(
          isNull(assignment.deletedAt),
          eq(role.key, 'system_admin'),
          eq(assignment.scopeType, 'national'),
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
          or(isNull(assignment.validFromOn), lte(assignment.validFromOn, today)),
          or(isNull(assignment.validToOn), gte(assignment.validToOn, today)),
        ),
      );
    return rows.length;
  }

  async listActiveByUser(userId: string, txDb: DatabaseOrTx = db) {
    const today = new Date().toISOString().slice(0, 10);
    return txDb
      .select()
      .from(assignment)
      .where(
        and(
          eq(assignment.userId, userId),
          isNull(assignment.deletedAt),
          or(isNull(assignment.validFromOn), lte(assignment.validFromOn, today)),
          or(isNull(assignment.validToOn), gte(assignment.validToOn, today)),
        ),
      );
  }

  async getUserPermissions(userId: string, txDb: DatabaseOrTx = db): Promise<string[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await txDb
      .select({ permission: rolePermission.permission })
      .from(assignment)
      .innerJoin(rolePermission, eq(assignment.roleId, rolePermission.roleId))
      .where(
        and(
          eq(assignment.userId, userId),
          isNull(assignment.deletedAt),
          or(isNull(assignment.validFromOn), lte(assignment.validFromOn, today)),
          or(isNull(assignment.validToOn), gte(assignment.validToOn, today)),
        ),
      );
    return [...new Set(rows.map((r) => r.permission))];
  }
}
