import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { appUser, SYSTEM_USER_ID } from '@idmis/db';
import {
  permissions,
  type SignInInput,
  type SignInResponse,
  type TotpVerifyInput,
  type TotpSetupResponse,
  type ChangePasswordInput,
  type ChangePasswordResponse,
  type AdminResetPasswordResponse,
  type AuthMeResponse,
  type RefreshTokenResponse,
  type SignOutResponse,
} from '@idmis/contracts';
import { AuthRepository } from '../repositories/auth.repository';
import { TokenService } from '../token.service';
import { TotpService } from '../totp.service';
import { RedisService } from '../../../platform/redis/redis.service';
import { AuthzService } from '../../../platform/auth/authz.service';
import type { UserAuthz } from '../../../platform/auth/authz.interface';
import { isCommonPassword } from '../password-policy';
import type { RequestUser } from '../../../platform/context';

export interface AuthSuccessWithCookie {
  response: SignInResponse | RefreshTokenResponse;
  rawRefreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly redisService: RedisService,
    private readonly authzService: AuthzService,
  ) {}

  // --- Sign In ---

  async signIn(
    input: SignInInput,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthSuccessWithCookie> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Reject SYSTEM_USER_ID unconditionally
    const user = await this.authRepository.findUserByEmail(normalizedEmail);
    if (user && user.id === SYSTEM_USER_ID) {
      await this.tokenService.verifyDummyPassword(input.password);
      this.logger.warn(
        { email: normalizedEmail, reason: 'system_user_rejection' },
        'Sign-in rejected',
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Unknown email (anti-enumeration: run dummy Argon2 verify)
    if (!user) {
      await this.tokenService.verifyDummyPassword(input.password);
      this.logger.warn({ email: normalizedEmail, reason: 'unknown_email' }, 'Sign-in rejected');
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Lockout check (source of truth: app_user.locked_until in DB, short-term cache in Redis)
    const isLockedInDb = user.lockedUntil && new Date(user.lockedUntil) > new Date();
    const isLockedInCache = await this.redisService.isLockedOut(normalizedEmail);
    if (isLockedInDb || isLockedInCache) {
      await this.tokenService.verifyDummyPassword(input.password);
      this.logger.warn(
        { email: normalizedEmail, reason: 'account_locked', lockedUntil: user.lockedUntil },
        'Sign-in rejected - account locked',
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Inactive user check
    if (!user.isActive) {
      await this.tokenService.verifyDummyPassword(input.password);
      this.logger.warn({ email: normalizedEmail, reason: 'user_inactive' }, 'Sign-in rejected');
      throw new UnauthorizedException('Invalid email or password');
    }

    // 5. Verify password with Argon2id
    const isPasswordValid = await this.tokenService.verifyPassword(
      user.passwordHash,
      input.password,
    );
    if (!isPasswordValid) {
      const lock = await this.authRepository.recordFailedSignIn(user.id);
      await this.redisService.recordFailedAttempt(normalizedEmail);
      if (lock.locked) {
        this.logger.warn(
          { email: normalizedEmail, reason: 'bad_password_and_locked', attempts: lock.attempts },
          'Sign-in failed - account locked',
        );
      } else {
        this.logger.warn(
          { email: normalizedEmail, reason: 'bad_password', attempts: lock.attempts },
          'Sign-in failed',
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    // Clear failed attempts upon successful password check in DB and cache
    await this.authRepository.resetFailedSignIns(user.id);
    await this.redisService.clearLockout(normalizedEmail);

    const roles = await this.authRepository.getUserRoles(user.id);
    const isSystemAdmin = roles.includes('system_admin');

    // 5. TOTP Checks
    if (isSystemAdmin) {
      if (user.totpConfirmedAt === null) {
        const tempToken = await this.tokenService.createTempToken(user.id, 'totp_setup');
        return { response: { status: 'totp_setup_required', tempToken } };
      }
      const tempToken = await this.tokenService.createTempToken(user.id, 'totp_verify');
      return { response: { status: 'totp_required', tempToken } };
    }

    if (user.totpConfirmedAt !== null) {
      const tempToken = await this.tokenService.createTempToken(user.id, 'totp_verify');
      return { response: { status: 'totp_required', tempToken } };
    }

    // 6. Must change password check
    if (user.mustChangePassword) {
      const tempToken = await this.tokenService.createTempToken(user.id, 'password_change');
      return { response: { status: 'password_change_required', tempToken } };
    }

    // 7. Full authentication
    return this.createAuthenticatedSession(user, input, userAgent, ip);
  }

  // --- TOTP Setup ---

  async setupTotp(tempToken: string): Promise<TotpSetupResponse> {
    const { sub } = await this.tokenService.verifyTempToken(tempToken, 'totp_setup');
    const user = await this.authRepository.findUserById(sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.totpConfirmedAt !== null) {
      throw new BadRequestException('TOTP has already been configured and verified');
    }

    // Generate secret
    const secret = this.totpService.generateSecret();
    await this.authRepository.saveTotpSecret(user.id, secret);

    const otpauthUrl = this.totpService.generateOtpauthUrl(user.email, secret);

    // Generate 10 recovery codes (hashed with Argon2id)
    const recoveryCodes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(5).toString('hex'); // 10 chars
      recoveryCodes.push(code);
      hashes.push(await this.tokenService.hashRecoveryCode(code));
    }

    await this.authRepository.createRecoveryCodes(user.id, hashes);

    return {
      secret,
      otpauthUrl,
      recoveryCodes,
    };
  }

  // --- TOTP Verify ---

  async verifyTotp(
    input: TotpVerifyInput,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthSuccessWithCookie> {
    const verified = await this.tokenService.verifyTempToken(input.tempToken, [
      'totp_verify',
      'totp_setup',
    ]);

    const user = await this.authRepository.findUserById(verified.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Lockout check (source of truth: app_user.locked_until in DB, short-term cache in Redis)
    const isLockedInDb = user.lockedUntil && new Date(user.lockedUntil) > new Date();
    const isLockedInCache = await this.redisService.isLockedOut(user.email);
    if (isLockedInDb || isLockedInCache) {
      throw new UnauthorizedException('Account is locked. Please try again later.');
    }

    if (input.totpCode) {
      if (!user.totpSecretEnc) {
        throw new UnauthorizedException('TOTP is not configured for this user');
      }
      const secret = Buffer.from(user.totpSecretEnc).toString('utf-8');
      const isValid = await this.totpService.verifyToken(input.totpCode, secret);
      if (!isValid) {
        const lock = await this.authRepository.recordFailedSignIn(user.id);
        await this.redisService.recordFailedAttempt(user.email);
        if (lock.locked) {
          throw new UnauthorizedException(
            'Account has been locked due to too many failed attempts. Please try again later.',
          );
        }
        throw new UnauthorizedException('Invalid TOTP code');
      }
    } else if (input.recoveryCode) {
      const unused = await this.authRepository.findUnusedRecoveryCodes(user.id);
      let matchedId: string | null = null;
      for (const rec of unused) {
        if (await this.tokenService.verifyRecoveryCode(rec.codeHash, input.recoveryCode)) {
          matchedId = rec.id;
          break;
        }
      }
      if (!matchedId) {
        const lock = await this.authRepository.recordFailedSignIn(user.id);
        await this.redisService.recordFailedAttempt(user.email);
        if (lock.locked) {
          throw new UnauthorizedException(
            'Account has been locked due to too many failed attempts. Please try again later.',
          );
        }
        throw new UnauthorizedException('Invalid or previously used recovery code');
      }
      await this.authRepository.markRecoveryCodeUsed(matchedId);
    } else {
      throw new BadRequestException('Must provide either totpCode or recoveryCode');
    }

    // Reset failed sign-ins and lockout on success
    await this.authRepository.resetFailedSignIns(user.id);
    await this.redisService.clearLockout(user.email);

    // Burn temporary token upon verification success
    await this.tokenService.burnTempTokenJti(verified.jti);

    // Confirm TOTP on user
    await this.authRepository.confirmTotp(user.id);

    // Next step: Check must_change_password
    if (user.mustChangePassword) {
      const nextTempToken = await this.tokenService.createTempToken(user.id, 'password_change');
      return {
        response: { status: 'password_change_required', tempToken: nextTempToken },
      };
    }

    // Authenticated session
    return this.createAuthenticatedSession(user, {}, userAgent, ip);
  }

  // --- Refresh Token Rotation ---

  async refresh(
    rawCookieToken?: string,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthSuccessWithCookie> {
    if (!rawCookieToken) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }

    const hash = this.tokenService.hashRefreshToken(rawCookieToken);
    const existingSession = await this.authRepository.findSessionByHash(hash);

    if (!existingSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // REUSE DETECTION: If this session was already replaced or revoked, revoke whole family!
    if (existingSession.revokedAt !== null || existingSession.replacedBySessionId !== null) {
      this.logger.warn(`Refresh token reuse detected for family: ${existingSession.familyId}`);
      await this.authRepository.revokeFamily(existingSession.familyId);
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions in this family have been revoked.',
      );
    }

    // Expiration check
    if (new Date(existingSession.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Rotate: Issue new 32+ byte refresh token, new sid, same family_id
    const newSid = crypto.randomUUID();
    const newRawRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.authRepository.rotateSession(existingSession.id, {
      id: newSid,
      familyId: existingSession.familyId,
      userId: existingSession.userId,
      deviceId: existingSession.deviceId,
      refreshTokenHash: newHash,
      expiresAt: newExpiresAt,
      userAgent,
      ip,
    });

    const user = await this.authRepository.findUserById(existingSession.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    const { accessToken, expiresIn } = await this.tokenService.createAccessToken(user.id, newSid);
    const authMe = await this.buildAuthMe(user);

    return {
      response: {
        accessToken,
        expiresIn,
        user: authMe,
      },
      rawRefreshToken: newRawRefreshToken,
    };
  }

  // --- Sign Out ---

  async signOut(rawCookieToken?: string, currentSessionId?: string): Promise<SignOutResponse> {
    if (rawCookieToken) {
      const hash = this.tokenService.hashRefreshToken(rawCookieToken);
      await this.authRepository.revokeSessionByHash(hash);
    }
    if (currentSessionId) {
      await this.authRepository.revokeSession(currentSessionId);
    }
    return { success: true };
  }

  // --- Change Password ---

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    currentSessionId?: string,
  ): Promise<ChangePasswordResponse> {
    if (isCommonPassword(input.newPassword)) {
      throw new BadRequestException('Password is too common or easily guessable');
    }

    if (input.newPassword === input.currentPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentValid = await this.tokenService.verifyPassword(
      user.passwordHash,
      input.currentPassword,
    );
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await this.tokenService.hashPassword(input.newPassword);
    await this.authRepository.updatePassword(user.id, newHash, false);

    // Password change revokes all of the user's other sessions (keeping the current one)
    await this.authRepository.revokeOtherUserSessions(user.id, currentSessionId);

    return { success: true, message: 'Password updated successfully' };
  }

  // --- Admin Reset Password ---

  async adminResetPassword(
    targetUserId: string,
    callerAdmin: RequestUser,
    callerAuthz?: UserAuthz,
  ): Promise<AdminResetPasswordResponse> {
    if (targetUserId === SYSTEM_USER_ID) {
      throw new BadRequestException('Cannot reset password for system user');
    }

    const authz = callerAuthz ?? (await this.authzService.getUserAuthz(callerAdmin.id));
    if (!authz.can(permissions.CORE_RESET_PASSWORD)) {
      throw new ForbiddenException(
        'Insufficient permissions: You do not have permission to reset user passwords',
      );
    }

    const callerScope = authz.scopeFor(permissions.CORE_RESET_PASSWORD);

    const targetUser = await this.authRepository.findUserById(targetUserId);
    if (!targetUser || !targetUser.isActive || targetUser.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }

    if (!callerScope.isNational) {
      const targetPermissions = await this.authRepository.getUserPermissions(targetUserId);
      const ADMIN_PROTECTED_PERMISSIONS: string[] = [
        permissions.CORE_USER_READ,
        permissions.CORE_USER_CREATE,
        permissions.CORE_USER_UPDATE,
        permissions.CORE_USER_DEACTIVATE,
        permissions.CORE_RESET_PASSWORD,
        permissions.CORE_ASSIGNMENT_MANAGE,
        permissions.CORE_ROLE_MANAGE,
      ];

      const targetHasAdminPerms = targetPermissions.some((p) =>
        ADMIN_PROTECTED_PERMISSIONS.includes(p),
      );

      // Non-national caller cannot reset anyone holding administrative permissions
      if (targetHasAdminPerms) {
        throw new NotFoundException('User not found');
      }

      // Check target user's assigned scope: must be strictly within caller's states
      const targetScope = await this.authRepository.getUserScope(targetUserId);
      if (
        targetScope.isNational ||
        targetScope.stateIds.length === 0 ||
        !targetScope.stateIds.every((sId) => callerScope.stateIds.includes(sId))
      ) {
        throw new NotFoundException('User not found');
      }
    }

    // High-entropy single-use temporary password
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await this.tokenService.hashPassword(temporaryPassword);

    await this.authRepository.updatePassword(targetUser.id, hash, true);
    // Admin reset revokes all of the user's sessions
    await this.authRepository.revokeAllUserSessions(targetUser.id);
    // Invalidate target user in authz cache
    await this.authzService.invalidateUser(targetUser.id);

    return {
      userId: targetUser.id,
      temporaryPassword,
      mustChangePassword: true,
    };
  }

  // --- Get Me ---

  async getMe(userId: string): Promise<AuthMeResponse> {
    const user = await this.authRepository.findUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return this.buildAuthMe(user);
  }

  // --- Helper Methods ---

  private async createAuthenticatedSession(
    user: typeof appUser.$inferSelect,
    deviceData: Partial<SignInInput>,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthSuccessWithCookie> {
    let deviceId: string | null = null;
    if (deviceData.installationId) {
      const dev = await this.authRepository.upsertDevice({
        installationId: deviceData.installationId,
        userId: user.id,
        label: deviceData.deviceLabel,
        platform: deviceData.platform,
      });
      deviceId = dev.id;
    }

    const sid = crypto.randomUUID();
    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const hash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.authRepository.createSession({
      id: sid,
      familyId: sid,
      userId: user.id,
      deviceId,
      refreshTokenHash: hash,
      expiresAt,
      userAgent,
      ip,
    });

    const { accessToken, expiresIn } = await this.tokenService.createAccessToken(user.id, sid);
    const authMe = await this.buildAuthMe(user);

    return {
      response: {
        status: 'authenticated',
        accessToken,
        expiresIn,
        user: authMe,
      },
      rawRefreshToken,
    };
  }

  async buildAuthMe(user: typeof appUser.$inferSelect): Promise<AuthMeResponse> {
    const roles = await this.authRepository.getUserRoles(user.id);
    const isSystemAdmin = roles.includes('system_admin');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      mustChangePassword: user.mustChangePassword,
      isSystemAdmin,
      totpEnabled: user.totpConfirmedAt !== null,
      roles: Array.from(new Set(roles)),
      createdAt: user.createdAt,
    };
  }
}
