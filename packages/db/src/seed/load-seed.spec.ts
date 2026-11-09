import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLoadSeed, validateLoadSeedGuards } from './load-seed';
import { seed } from '../seed';
import { setDatabaseUrl } from '../index';

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

  it('seeds approved rows with approved_at and approved_by populated on farmer, plot, and plot_allocation', async () => {
    const TEST_DB_NAME = `idmis_load_seed_test_${Date.now()}`;
    const baseAdminUrl =
      process.env.DATABASE_ADMIN_URL ||
      process.env.DATABASE_URL ||
      'postgresql://idmis:idmis@localhost:5432/idmis';
    const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

    const adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    const sqlClient = postgres(testDbUrl);
    const testDb = drizzle(sqlClient);
    try {
      const migrationsFolder = path.resolve(__dirname, '../../migrations');
      await migrate(testDb, { migrationsFolder });

      setDatabaseUrl(testDbUrl);
      await seed();

      await runLoadSeed({
        dbUrl: testDbUrl,
        totalTarget: 2,
        batchSize: 2,
        encryptionKey: 'a'.repeat(32),
        identityHashKey: 'b'.repeat(32),
      });

      const farmers = await sqlClient`
        SELECT status, approved_at, approved_by
        FROM slis.farmer
        WHERE farmer_code LIKE 'LOAD-FRM-%'
      `;
      expect(farmers.length).toBe(2);
      for (const f of farmers) {
        expect(f.status).toBe('approved');
        expect(f.approved_at).toBeDefined();
        expect(f.approved_at).not.toBeNull();
        expect(f.approved_by).toBeDefined();
        expect(f.approved_by).not.toBeNull();
      }

      const plots = await sqlClient`
        SELECT status, approved_at, approved_by
        FROM slis.plot
        WHERE plot_code LIKE 'LOAD-PLT-%'
      `;
      expect(plots.length).toBe(2);
      for (const p of plots) {
        expect(p.status).toBe('approved');
        expect(p.approved_at).toBeDefined();
        expect(p.approved_at).not.toBeNull();
        expect(p.approved_by).toBeDefined();
        expect(p.approved_by).not.toBeNull();
      }

      const allocations = await sqlClient`
        SELECT status, approved_at, approved_by
        FROM slis.plot_allocation
      `;
      expect(allocations.length).toBe(2);
      for (const a of allocations) {
        expect(a.status).toBe('approved');
        expect(a.approved_at).toBeDefined();
        expect(a.approved_at).not.toBeNull();
        expect(a.approved_by).toBeDefined();
        expect(a.approved_by).not.toBeNull();
      }
    } finally {
      await sqlClient.end();
      setDatabaseUrl(baseAdminUrl);
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end();
    }
  }, 30000);
});
