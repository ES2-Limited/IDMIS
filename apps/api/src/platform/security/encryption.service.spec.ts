import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.service';
import type { ApiEnv } from '../config/env';

describe('EncryptionService (AES-256-GCM)', () => {
  const service = new EncryptionService();

  it('encrypts and decrypts strings correctly', () => {
    const secret = '01234567890';
    const encrypted = service.encrypt(secret);

    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(28);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('generates unique ciphertexts for identical plaintext due to random IV', () => {
    const text = 'bank-account-secret-123';
    const enc1 = service.encrypt(text);
    const enc2 = service.encrypt(text);

    expect(enc1.equals(enc2)).toBe(false);
    expect(service.decrypt(enc1)).toBe(text);
    expect(service.decrypt(enc2)).toBe(text);
  });

  it('fails decryption if ciphertext buffer is corrupted or tampered with', () => {
    const text = 'important-financial-data';
    const encrypted = service.encrypt(text);
    // Tamper with the last byte
    encrypted[encrypted.length - 1] ^= 0xff;

    expect(() => service.decrypt(encrypted)).toThrow();
  });

  it('prefixes ciphertext with 1-byte key-id and supports key rotation via ENCRYPTION_KEYS', () => {
    const oldKey = 'old-key-secret-must-be-min-32-chars-long';
    const newKey = 'new-key-secret-must-be-min-32-chars-long';

    // Service 1 uses oldKey as primary (ID: 1)
    const serviceOld = new EncryptionService({
      NODE_ENV: 'test',
      ENCRYPTION_KEY: oldKey,
    } as unknown as ApiEnv);

    const plaintext = 'top-secret-data';
    const ciphertextOld = serviceOld.encrypt(plaintext);

    // Verify 1-byte key-id prefix is 1
    expect(ciphertextOld.readUInt8(0)).toBe(1);

    // Service 2 has rotated to newKey (primary ID: 1, or oldKey stored in ENCRYPTION_KEYS ID: 2)
    // Suppose rotation moved oldKey to ID: 1 and newKey to primary with ENCRYPTION_KEYS: "1:oldKey"
    const serviceRotated = new EncryptionService({
      NODE_ENV: 'test',
      ENCRYPTION_KEY: newKey,
      ENCRYPTION_KEYS: `1:${oldKey}`,
    } as unknown as ApiEnv);

    // Can decrypt old data encrypted with key 1
    expect(serviceRotated.decrypt(ciphertextOld)).toBe(plaintext);

    // New encryption uses newKey
    const ciphertextNew = serviceRotated.encrypt(plaintext);
    expect(serviceRotated.decrypt(ciphertextNew)).toBe(plaintext);
  });

  it('fails startup in production if ENCRYPTION_KEY is absent', () => {
    expect(() => {
      new EncryptionService({
        NODE_ENV: 'production',
      } as unknown as ApiEnv);
    }).toThrow(/ENCRYPTION_KEY is required in production/);
  });

  it('masks account number to last 4 digits', () => {
    expect(service.maskAccount('0123456789')).toBe('6789');
    expect(service.maskAccount('123')).toBe('123');
    expect(service.maskAccount(null)).toBeNull();
  });
});
