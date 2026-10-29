import { Inject, Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { validateApiEnv, type ApiEnv } from '../config/env';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv || validateApiEnv();
    // Derives 32-byte key using SHA-256 from configured encryption key
    this.key = crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();
  }

  /**
   * Encrypts plaintext string using AES-256-GCM.
   * Returns Buffer: [12-byte IV][16-byte AuthTag][Ciphertext]
   */
  encrypt(plaintext: string): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]);
  }

  /**
   * Decrypts buffer created by encrypt().
   */
  decrypt(data: Buffer): string {
    if (data.length < 28) {
      throw new Error('Invalid ciphertext buffer length');
    }
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
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
