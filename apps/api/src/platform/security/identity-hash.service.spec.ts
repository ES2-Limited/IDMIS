import { describe, expect, it } from 'vitest';
import { IdentityHashService } from './identity-hash.service';
import type { ApiEnv } from '../config/env';

describe('IdentityHashService (HMAC-SHA256)', () => {
  const service = new IdentityHashService();

  it('generates deterministic HMAC-SHA256 with key ID prefix "1:"', () => {
    const nin = '12345678901';
    const hash1 = service.hash(nin);
    const hash2 = service.hash(nin);

    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('1:')).toBe(true);
    expect(hash1.length).toBe(2 + 64); // "1:" + 64 hex chars
  });

  it('normalizes plaintext by trimming whitespace and converting to uppercase', () => {
    const raw = '  ab1234cd  ';
    const hashRaw = service.hash(raw);
    const hashNormalized = service.hash('AB1234CD');

    expect(hashRaw).toBe(hashNormalized);
    expect(service.verify('ab1234cd', hashRaw)).toBe(true);
  });

  it('extracts last 4 characters accurately', () => {
    expect(service.getLast4('12345678901')).toBe('8901');
    expect(service.getLast4('A123')).toBe('A123');
    expect(service.getLast4('12')).toBe('12');
  });

  it('verifies valid hashes and rejects tampered numbers', () => {
    const nin = '98765432100';
    const hash = service.hash(nin);

    expect(service.verify(nin, hash)).toBe(true);
    expect(service.verify('98765432101', hash)).toBe(false);
  });

  it('supports key rotation via IDENTITY_HASH_KEYS and finds candidates across all keys', () => {
    const oldKey = 'old-key-identity-must-be-min-32-chars-long';
    const newKey = 'new-key-identity-must-be-min-32-chars-long';

    // Service 1 uses oldKey as primary (ID 1)
    const oldService = new IdentityHashService({
      NODE_ENV: 'test',
      IDENTITY_HASH_KEY: oldKey,
    } as unknown as ApiEnv);

    const nin = '22334455667';
    const oldHash = oldService.hash(nin);
    expect(oldHash.startsWith('1:')).toBe(true);

    // Service 2 has rotated to newKey as primary (ID 1) and retains oldKey as ID 2
    const rotatedService = new IdentityHashService({
      NODE_ENV: 'test',
      IDENTITY_HASH_KEY: newKey,
      IDENTITY_HASH_KEYS: `2:${oldKey}`,
    } as unknown as ApiEnv);

    // Rotated service produces new primary hash
    const newHash = rotatedService.hash(nin);
    expect(newHash).not.toBe(oldHash);

    // Rotated service can still verify the old hash created with oldKey
    expect(rotatedService.verify(nin, `2:${oldHash.slice(2)}`)).toBe(true);

    // Rotated service returns candidates for querying database
    const candidates = rotatedService.findCandidates(nin);
    expect(candidates).toHaveLength(2);
    expect(candidates).toContain(newHash);
    expect(candidates).toContain(`2:${oldHash.slice(2)}`);
  });

  it('throws an error in production if IDENTITY_HASH_KEY is missing', () => {
    expect(
      () =>
        new IdentityHashService({
          NODE_ENV: 'production',
        } as unknown as ApiEnv),
    ).toThrow('IDENTITY_HASH_KEY is required in production');
  });
});
