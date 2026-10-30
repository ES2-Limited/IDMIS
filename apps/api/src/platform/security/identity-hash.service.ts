import { Inject, Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { validateApiEnv, type ApiEnv } from '../config/env';

@Injectable()
export class IdentityHashService {
  private readonly primaryKeyId: number = 1;
  private readonly keys: Map<number, Buffer> = new Map();

  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv || validateApiEnv();
    const rawPrimary = env.IDENTITY_HASH_KEY;

    if (!rawPrimary) {
      if (env.NODE_ENV === 'production') {
        throw new Error('IDENTITY_HASH_KEY is required in production');
      }
      // Test/development fallback key (32 bytes)
      const testKey = crypto
        .createHash('sha256')
        .update('idmis-identity-hash-dev-key-32bytes-min')
        .digest();
      this.keys.set(this.primaryKeyId, testKey);
    } else {
      const primaryKey = crypto.createHash('sha256').update(rawPrimary).digest();
      this.keys.set(this.primaryKeyId, primaryKey);
    }

    // Parse old keys from IDENTITY_HASH_KEYS for rotation support
    if (env.IDENTITY_HASH_KEYS) {
      try {
        if (env.IDENTITY_HASH_KEYS.trim().startsWith('{')) {
          const parsed = JSON.parse(env.IDENTITY_HASH_KEYS) as Record<string, string>;
          for (const [idStr, secret] of Object.entries(parsed)) {
            const id = parseInt(idStr, 10);
            if (!isNaN(id) && id >= 0 && id <= 255) {
              this.keys.set(id, crypto.createHash('sha256').update(secret).digest());
            }
          }
        } else {
          // Format "1:secret1,2:secret2"
          const pairs = env.IDENTITY_HASH_KEYS.split(',');
          for (const pair of pairs) {
            const [idStr, secret] = pair.split(':');
            if (idStr && secret) {
              const id = parseInt(idStr.trim(), 10);
              if (!isNaN(id) && id >= 0 && id <= 255) {
                this.keys.set(id, crypto.createHash('sha256').update(secret.trim()).digest());
              }
            }
          }
        }
      } catch (err) {
        throw new Error(`Failed to parse IDENTITY_HASH_KEYS: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
  }

  /**
   * Normalize an identification document number before hashing.
   * Trims whitespace and converts to uppercase for uniform matching.
   */
  normalize(value: string): string {
    return value.trim().toUpperCase();
  }

  /**
   * Extract unmasked last 4 characters for safe display/search.
   */
  getLast4(value: string): string {
    const cleaned = value.trim();
    return cleaned.length <= 4 ? cleaned : cleaned.slice(-4);
  }

  /**
   * Alias for getLast4.
   */
  last4(value: string): string {
    return this.getLast4(value);
  }

  /**
   * Mask an identification document number (e.g. ••••1234).
   */
  mask(value: string): string {
    const l4 = this.getLast4(value);
    return `••••${l4}`;
  }

  /**
   * Computes HMAC-SHA256 hash using the primary key.
   * Returns a versioned hash string: "${keyId}:${hmacHex}".
   */
  hash(value: string): string {
    const normalized = this.normalize(value);
    const key = this.keys.get(this.primaryKeyId);
    if (!key) {
      throw new Error(`Primary identity hash key ${this.primaryKeyId} not found`);
    }

    const hmac = crypto.createHmac('sha256', key).update(normalized).digest('hex');
    return `${this.primaryKeyId}:${hmac}`;
  }

  /**
   * Generates candidate hashes across all active keys in the ring (primary + rotated).
   * Used for querying the database to find matches even if key was rotated.
   */
  findCandidates(value: string): string[] {
    const normalized = this.normalize(value);
    const candidates: string[] = [];

    for (const [keyId, key] of this.keys.entries()) {
      const hmac = crypto.createHmac('sha256', key).update(normalized).digest('hex');
      candidates.push(`${keyId}:${hmac}`);
    }

    return candidates;
  }

  /**
   * Verifies if a plaintext matches a stored hash string.
   */
  verify(value: string, storedHash: string): boolean {
    const normalized = this.normalize(value);
    const parts = storedHash.split(':');
    if (parts.length === 2) {
      const keyId = parseInt(parts[0]!, 10);
      const expectedHmac = parts[1]!;
      const key = this.keys.get(keyId);
      if (key) {
        const actualHmac = crypto.createHmac('sha256', key).update(normalized).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(actualHmac), Buffer.from(expectedHmac))) {
          return true;
        }
      }
    }

    // Fallback: test all keys in the keyring
    for (const key of this.keys.values()) {
      const actualHmac = crypto.createHmac('sha256', key).update(normalized).digest('hex');
      const target = parts.length === 2 ? parts[1]! : storedHash;
      if (
        actualHmac.length === target.length &&
        crypto.timingSafeEqual(Buffer.from(actualHmac), Buffer.from(target))
      ) {
        return true;
      }
    }

    return false;
  }
}
