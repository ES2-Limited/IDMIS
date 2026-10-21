import { Injectable } from '@nestjs/common';
import {
  db,
  appUser,
  device,
  session,
  totpRecoveryCode,
  assignment,
  role,
  eq,
  ne,
  and,
  isNull,
} from '@idmis/db';
import type { RequestScope } from '../../../platform/context';

export interface CreateSessionData {
  id: string;
  familyId: string;
  userId: string;
  deviceId?: string | null;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
}

export interface UpsertDeviceData {
  installationId: string;
  userId: string;
  label?: string;
  platform?: string;
}

@Injectable()
export class AuthRepository {
  // --- User Queries ---

  async findUserByEmail(email: string) {
    const rows = await db
      .select()
      .from(appUser)
      .where(and(eq(appUser.email, email.toLowerCase().trim()), isNull(appUser.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  async findUserById(id: string) {
    const rows = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1);
    return rows[0] || null;
  }

  async recordFailedSignIn(userId: string): Promise<{ locked: boolean; attempts: number }> {
    const rows = await db
      .select({
        failedSignIns: appUser.failedSignIns,
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    const currentAttempts = rows[0]?.failedSignIns ?? 0;
    const newAttempts = currentAttempts + 1;
    const now = new Date().toISOString();

    if (newAttempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await db
        .update(appUser)
        .set({
          failedSignIns: newAttempts,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(appUser.id, userId));

      return { locked: true, attempts: newAttempts };
    }

    await db
      .update(appUser)
      .set({
        failedSignIns: newAttempts,
        updatedAt: now,
      })
      .where(eq(appUser.id, userId));

    return { locked: false, attempts: newAttempts };
  }

  async resetFailedSignIns(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(appUser)
      .set({
        failedSignIns: 0,
        lockedUntil: null,
        lastSignInAt: now,
        updatedAt: now,
      })
      .where(eq(appUser.id, userId));
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await db
      .select({
        roleKey: role.key,
      })
      .from(assignment)
      .innerJoin(role, eq(assignment.roleId, role.id))
      .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)));

    return rows.map((r) => r.roleKey);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const roles = await this.getUserRoles(userId);
    if (roles.includes('system_admin')) {
      // System administrator has full permissions
      const { permissions } = await import('@idmis/contracts');
      return Object.values(permissions);
    }

    const { rolePermission } = await import('@idmis/db');
    const rows = await db
      .select({
        permission: rolePermission.permission,
      })
      .from(assignment)
      .innerJoin(rolePermission, eq(assignment.roleId, rolePermission.roleId))
      .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)));

    return Array.from(new Set(rows.map((r) => r.permission)));
  }

  async getUserScope(userId: string): Promise<RequestScope> {
    const rows = await db
      .select({
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
      })
      .from(assignment)
      .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)));

    let isNational = false;
    const stateIds = new Set<string>();
    const schemeIds = new Set<string>();
    const sectorIds = new Set<string>();

    for (const row of rows) {
      if (row.scopeType === 'national') {
        isNational = true;
      } else if (row.scopeType === 'state' && row.scopeStateId) {
        stateIds.add(row.scopeStateId);
      } else if (row.scopeType === 'scheme' && row.scopeOrgId) {
        schemeIds.add(row.scopeOrgId);
      } else if (row.scopeType === 'sector' && row.scopeOrgId) {
        sectorIds.add(row.scopeOrgId);
      } else if (row.scopeType === 'rbda' && row.scopeOrgId) {
        // RBDA assignments expand to schemes
        schemeIds.add(row.scopeOrgId);
      }
    }

    return {
      isNational,
      stateIds: Array.from(stateIds),
      schemeIds: Array.from(schemeIds),
      sectorIds: Array.from(sectorIds),
    };
  }

  // --- Device Management ---

  async upsertDevice(data: UpsertDeviceData) {
    const existing = await db
      .select()
      .from(device)
      .where(and(eq(device.installationId, data.installationId), eq(device.userId, data.userId)))
      .limit(1);

    const now = new Date().toISOString();
    if (existing[0]) {
      const updated = await db
        .update(device)
        .set({
          label: data.label ?? existing[0].label,
          platform: data.platform ?? existing[0].platform,
          lastSeenAt: now,
        })
        .where(eq(device.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const created = await db
      .insert(device)
      .values({
        id: crypto.randomUUID(),
        installationId: data.installationId,
        userId: data.userId,
        label: data.label ?? null,
        platform: data.platform ?? null,
        registeredAt: now,
        lastSeenAt: now,
      })
      .returning();
    return created[0];
  }

  // --- Session & Refresh Token Queries ---

  async findSessionByHash(refreshTokenHash: string) {
    const rows = await db
      .select()
      .from(session)
      .where(eq(session.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return rows[0] || null;
  }

  async findSessionById(id: string) {
    const rows = await db.select().from(session).where(eq(session.id, id)).limit(1);
    return rows[0] || null;
  }

  async createSession(data: CreateSessionData) {
    const now = new Date().toISOString();
    const rows = await db
      .insert(session)
      .values({
        id: data.id,
        familyId: data.familyId,
        userId: data.userId,
        deviceId: data.deviceId ?? null,
        refreshTokenHash: data.refreshTokenHash,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: data.expiresAt.toISOString(),
        userAgent: data.userAgent ?? null,
        ip: data.ip ?? null,
      })
      .returning();
    return rows[0];
  }

  async rotateSession(oldSessionId: string, newSessionData: CreateSessionData) {
    return db.transaction(async (tx) => {
      const now = new Date().toISOString();

      // 1. Insert new session
      const created = await tx
        .insert(session)
        .values({
          id: newSessionData.id,
          familyId: newSessionData.familyId,
          userId: newSessionData.userId,
          deviceId: newSessionData.deviceId ?? null,
          refreshTokenHash: newSessionData.refreshTokenHash,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: newSessionData.expiresAt.toISOString(),
          userAgent: newSessionData.userAgent ?? null,
          ip: newSessionData.ip ?? null,
        })
        .returning();

      // 2. Mark old session replaced and revoked
      await tx
        .update(session)
        .set({
          replacedBySessionId: newSessionData.id,
          revokedAt: now,
          lastUsedAt: now,
        })
        .where(eq(session.id, oldSessionId));

      return created[0];
    });
  }

  async revokeSession(id: string) {
    const now = new Date().toISOString();
    await db.update(session).set({ revokedAt: now }).where(eq(session.id, id));
  }

  async revokeSessionByHash(refreshTokenHash: string) {
    const now = new Date().toISOString();
    await db
      .update(session)
      .set({ revokedAt: now })
      .where(eq(session.refreshTokenHash, refreshTokenHash));
  }

  async revokeFamily(familyId: string) {
    const now = new Date().toISOString();
    await db
      .update(session)
      .set({ revokedAt: now })
      .where(and(eq(session.familyId, familyId), isNull(session.revokedAt)));
  }

  async revokeAllUserSessions(userId: string) {
    const now = new Date().toISOString();
    await db
      .update(session)
      .set({ revokedAt: now })
      .where(and(eq(session.userId, userId), isNull(session.revokedAt)));
  }

  async revokeOtherUserSessions(userId: string, currentSessionId?: string) {
    const now = new Date().toISOString();
    if (currentSessionId) {
      await db
        .update(session)
        .set({ revokedAt: now })
        .where(
          and(
            eq(session.userId, userId),
            ne(session.id, currentSessionId),
            isNull(session.revokedAt),
          ),
        );
    } else {
      await db
        .update(session)
        .set({ revokedAt: now })
        .where(and(eq(session.userId, userId), isNull(session.revokedAt)));
    }
  }

  // --- TOTP & Recovery Codes ---

  async saveTotpSecret(userId: string, secret: string) {
    await db
      .update(appUser)
      .set({
        totpSecretEnc: Buffer.from(secret, 'utf-8'),
      })
      .where(eq(appUser.id, userId));
  }

  async confirmTotp(userId: string) {
    const now = new Date().toISOString();
    await db
      .update(appUser)
      .set({
        totpConfirmedAt: now,
      })
      .where(eq(appUser.id, userId));
  }

  async createRecoveryCodes(userId: string, codeHashes: string[]) {
    return db.transaction(async (tx) => {
      // Invalidate/delete any previous unused recovery codes
      await tx
        .delete(totpRecoveryCode)
        .where(and(eq(totpRecoveryCode.userId, userId), isNull(totpRecoveryCode.usedAt)));

      const now = new Date().toISOString();
      const values = codeHashes.map((codeHash) => ({
        id: crypto.randomUUID(),
        userId,
        codeHash,
        createdAt: now,
      }));

      await tx.insert(totpRecoveryCode).values(values);
    });
  }

  async findUnusedRecoveryCodes(userId: string) {
    return db
      .select()
      .from(totpRecoveryCode)
      .where(and(eq(totpRecoveryCode.userId, userId), isNull(totpRecoveryCode.usedAt)));
  }

  async markRecoveryCodeUsed(id: string) {
    const now = new Date().toISOString();
    await db.update(totpRecoveryCode).set({ usedAt: now }).where(eq(totpRecoveryCode.id, id));
  }

  // --- Password Updates ---

  async updatePassword(userId: string, passwordHash: string, mustChangePassword = false) {
    await db
      .update(appUser)
      .set({
        passwordHash,
        mustChangePassword,
      })
      .where(eq(appUser.id, userId));
  }
}
