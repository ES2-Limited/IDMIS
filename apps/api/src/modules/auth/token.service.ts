import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { AccessTokenPayloadSchema, type AccessTokenPayload } from '@idmis/contracts';
import { RedisService } from '../../platform/redis/redis.service';

/**
 * SECURITY SPECIFICATION (TRIMING IDMIS 2.0 Auth):
 *
 * 1. Refresh tokens:
 *    - Must be at least 32 cryptographically random bytes (crypto.randomBytes(32)).
 *    - Transmitted exclusively through secure httpOnly cookies.
 *    - Stored in the database (core.session.refresh_token_hash) strictly as SHA-256 hex hashes.
 *
 * 2. User passwords:
 *    - Hashed using Argon2id (argon2.argon2id) with salt generated per hash.
 *    - Stored in core.app_user.password_hash.
 *
 * 3. TOTP recovery codes:
 *    - High-entropy single-use recovery codes.
 *    - Hashed using Argon2id (argon2.argon2id) in core.totp_recovery_code.code_hash.
 *
 * 4. Access tokens:
 *    - Short-lived JWTs (15 minutes).
 *    - Minimal payload containing ONLY sub (user UUID), sid (session UUID), iat, and exp.
 *
 * 5. Temporary tokens (tempToken):
 *    - Signed JWTs valid for 5 minutes for a single next step only.
 *    - Claims include sub, purpose (totp_verify | totp_setup | password_change), and jti.
 *    - Single-use enforced via Redis jti consumption until expiry.
 */

export type TempTokenPurpose = 'totp_verify' | 'totp_setup' | 'password_change';

/**
 * Pre-computed Argon2id hash for constant-time dummy verification.
 * Used when sign-in is attempted with unknown emails, inactive users, or locked accounts
 * to ensure timing attacks cannot enumerate existing accounts.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$HDbUwXCJGtzG96ZHHlOOgA$jSnZSkRJHX3iTcmbhd8dd4m+dnJ6TQwO2AQ5jV4K9Ww';

@Injectable()
export class TokenService {
  private readonly secretKey: Uint8Array;

  constructor(private readonly redisService: RedisService) {
    const secret = process.env.JWT_SECRET || 'development-jwt-secret-min-16-chars-long';
    this.secretKey = new TextEncoder().encode(secret);
  }

  // --- Password Hashing (Argon2id) ---

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyDummyPassword(plain: string): Promise<boolean> {
    return this.verifyPassword(DUMMY_PASSWORD_HASH, plain);
  }

  // --- Recovery Code Hashing (Argon2id) ---

  async hashRecoveryCode(code: string): Promise<string> {
    return argon2.hash(code, { type: argon2.argon2id });
  }

  async verifyRecoveryCode(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  // --- Refresh Tokens (32+ random bytes, SHA-256 hashed) ---

  generateRefreshToken(): string {
    // 32 cryptographically random bytes = 64 hex chars
    return crypto.randomBytes(32).toString('hex');
  }

  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // --- Access Tokens (15 minutes, strict sub + sid) ---

  async createAccessToken(
    sub: string,
    sid: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const expiresIn = 15 * 60; // 900 seconds
    const accessToken = await new SignJWT({ sid })
      .setSubject(sub)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.secretKey);

    return { accessToken, expiresIn };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey);
      return AccessTokenPayloadSchema.parse(payload);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  // --- Temporary Tokens (5 minutes, single-use, purpose claim) ---

  async createTempToken(sub: string, purpose: TempTokenPurpose): Promise<string> {
    const jti = crypto.randomUUID();
    return new SignJWT({ purpose, jti })
      .setSubject(sub)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.secretKey);
  }

  async verifyTempToken(
    token: string,
    allowedPurposes: TempTokenPurpose | TempTokenPurpose[],
  ): Promise<{ sub: string; purpose: TempTokenPurpose; jti: string }> {
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, this.secretKey);
      payload = result.payload as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid or expired temporary token');
    }

    const sub = payload.sub;
    const purpose = payload.purpose as TempTokenPurpose;
    const jti = payload.jti;

    if (typeof sub !== 'string' || typeof jti !== 'string' || !purpose) {
      throw new UnauthorizedException('Malformed temporary token payload');
    }

    const allowed = Array.isArray(allowedPurposes) ? allowedPurposes : [allowedPurposes];
    if (!allowed.includes(purpose)) {
      throw new UnauthorizedException(
        `Temporary token purpose '${purpose}' is not valid for this action (expected: ${allowed.join(', ')})`,
      );
    }

    // Check if already burned
    const isBurned = await this.redisService.get(`auth:jti:burned:${jti}`);
    if (isBurned) {
      throw new UnauthorizedException('Temporary token has already been used');
    }

    return { sub, purpose, jti };
  }

  async burnTempTokenJti(jti: string, ttlSeconds = 300): Promise<void> {
    await this.redisService.set(`auth:jti:burned:${jti}`, '1', ttlSeconds);
  }

  async verifyAndConsumeTempToken(
    token: string,
    allowedPurposes: TempTokenPurpose | TempTokenPurpose[],
  ): Promise<{ sub: string; purpose: TempTokenPurpose; jti: string }> {
    const verified = await this.verifyTempToken(token, allowedPurposes);
    await this.burnTempTokenJti(verified.jti);
    return verified;
  }
}
