import { Inject, Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { validateApiEnv, type ApiEnv } from '../config/env';

@Injectable()
export class EncryptionService {
  private readonly primaryKeyId: number = 1;
  private readonly keys: Map<number, Buffer> = new Map();

  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv || validateApiEnv();
    const rawPrimary = env.ENCRYPTION_KEY;

    if (!rawPrimary) {
      if (env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY is required in production');
      }
      // Test/development fallback key (32 bytes)
      const testKey = crypto
        .createHash('sha256')
        .update('0123456789abcdef0123456789abcdef')
        .digest();
      this.keys.set(this.primaryKeyId, testKey);
    } else {
      const primaryKey = crypto.createHash('sha256').update(rawPrimary).digest();
      this.keys.set(this.primaryKeyId, primaryKey);
    }

    // Parse old keys from ENCRYPTION_KEYS for rotation support
    if (env.ENCRYPTION_KEYS) {
      try {
        if (env.ENCRYPTION_KEYS.trim().startsWith('{')) {
          const parsed = JSON.parse(env.ENCRYPTION_KEYS) as Record<string, string>;
          for (const [idStr, secret] of Object.entries(parsed)) {
            const id = parseInt(idStr, 10);
            if (!isNaN(id) && id >= 0 && id <= 255) {
              this.keys.set(id, crypto.createHash('sha256').update(secret).digest());
            }
          }
        } else {
          // Format "1:secret1,2:secret2"
          const pairs = env.ENCRYPTION_KEYS.split(',');
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
        throw new Error(`Failed to parse ENCRYPTION_KEYS: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
  }

  /**
   * Encrypts plaintext string using AES-256-GCM.
   * Format: [1-byte KeyId][12-byte IV][16-byte AuthTag][Ciphertext]
   */
  encrypt(plaintext: string): Buffer {
    const key = this.keys.get(this.primaryKeyId);
    if (!key) {
      throw new Error(`Primary encryption key ID ${this.primaryKeyId} not configured`);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([Buffer.from([this.primaryKeyId]), iv, tag, encrypted]);
  }

  /**
   * Decrypts buffer created by encrypt(), selecting key by 1-byte key ID prefix.
   */
  decrypt(data: Buffer): string {
    if (data.length < 29) {
      throw new Error('Invalid ciphertext buffer length');
    }

    const keyId = data.readUInt8(0);
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Unknown encryption key ID: ${keyId}`);
    }

    const iv = data.subarray(1, 13);
    const tag = data.subarray(13, 29);
    const ciphertext = data.subarray(29);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  /**
   * Helper to extract last 4 digits for masked display.
   */
  maskAccount(accountNumber?: string | null): string | null {
    if (!accountNumber) return null;
    const cleaned = accountNumber.trim();
    if (cleaned.length <= 4) return cleaned;
    return cleaned.slice(-4);
  }
}
