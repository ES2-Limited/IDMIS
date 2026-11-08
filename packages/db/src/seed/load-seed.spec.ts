import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLoadSeed, validateLoadSeedGuards } from './load-seed';

describe('Load Seed Guard & Execution Specification (BE-5.3)', () => {
  const origEnv = process.env.NODE_ENV;
  const origConfirm = process.env.LOAD_SEED_CONFIRM;
  const origEnc = process.env.ENCRYPTION_KEY;
  const origIdHash = process.env.IDENTITY_HASH_KEY;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.LOAD_SEED_CONFIRM = 'yes';
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    process.env.IDENTITY_HASH_KEY = 'b'.repeat(32);
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    if (origConfirm !== undefined) process.env.LOAD_SEED_CONFIRM = origConfirm;
    else delete process.env.LOAD_SEED_CONFIRM;
    if (origEnc !== undefined) process.env.ENCRYPTION_KEY = origEnc;
    else delete process.env.ENCRYPTION_KEY;
    if (origIdHash !== undefined) process.env.IDENTITY_HASH_KEY = origIdHash;
    else delete process.env.IDENTITY_HASH_KEY;
  });

  it('throws an error if NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateLoadSeedGuards('postgres://idmis:idmis@localhost:5432/idmis_dev')).toThrow(
      /Refusing to run load seed when NODE_ENV is production/,
    );
  });

  it('throws an error if LOAD_SEED_CONFIRM is not "yes"', () => {
    delete process.env.LOAD_SEED_CONFIRM;
    expect(() => validateLoadSeedGuards('postgres://idmis:idmis@localhost:5432/idmis_dev')).toThrow(
      /LOAD_SEED_CONFIRM=yes/,
    );
  });

  it('throws an error if database name contains "prod"', () => {
    expect(() =>
      validateLoadSeedGuards('postgres://user:pass@railway.internal:5432/idmis_production'),
    ).toThrow(/Refusing to run load seed on database containing "prod"/);
    expect(() =>
      validateLoadSeedGuards('postgres://user:pass@railway.internal:5432/prod_idmis'),
    ).toThrow(/Refusing to run load seed on database containing "prod"/);
  });

  it('throws an error if ENCRYPTION_KEY is unset or empty', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() =>
      validateLoadSeedGuards('postgres://idmis:idmis@127.0.0.1:5432/idmis', { encryptionKey: '' }),
    ).toThrow(/ENCRYPTION_KEY is required and must not be empty for load seed/);
  });

  it('throws an error if IDENTITY_HASH_KEY is unset or empty', () => {
    delete process.env.IDENTITY_HASH_KEY;
    expect(() =>
      validateLoadSeedGuards('postgres://idmis:idmis@127.0.0.1:5432/idmis', {
        identityHashKey: '',
      }),
    ).toThrow(/IDENTITY_HASH_KEY is required and must not be empty for load seed/);
  });

  it('passes validation when guards and required keys are satisfied', () => {
    expect(() =>
      validateLoadSeedGuards('postgres://idmis:idmis@127.0.0.1:5432/idmis'),
    ).not.toThrow();
  });

  it('runLoadSeed throws a clear error if IDENTITY_HASH_KEY is unset even in development', async () => {
    delete process.env.IDENTITY_HASH_KEY;
    await expect(
      runLoadSeed({ identityHashKey: '', dbUrl: 'postgres://idmis:idmis@127.0.0.1:5432/idmis' }),
    ).rejects.toThrow(/IDENTITY_HASH_KEY is required and must not be empty for load seed/);
  });
});
