import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.service';

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

  it('masks account number to last 4 digits', () => {
    expect(service.maskAccount('0123456789')).toBe('6789');
    expect(service.maskAccount('123')).toBe('123');
    expect(service.maskAccount(null)).toBeNull();
  });
});
