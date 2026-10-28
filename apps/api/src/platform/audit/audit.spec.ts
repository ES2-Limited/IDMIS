import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { postgres, drizzle, migrate, setDatabaseUrl } from '@idmis/db';
import * as schema from '@idmis/db';
import { isSensitiveFieldName, SENSITIVE_DENY_LIST, redactSensitiveFields } from './redaction';
import { runInTransaction, resetAuditWriter } from '../database/transaction.helper';
import { initAuditWriter } from './audit-writer';
import { AuditModule } from './audit.module';

describe('Audit Log & Redaction Specification (BE-1.5)', () => {
  const TEST_DB_NAME = `idmis_audit_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    // Apply migrations
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();
  });

  afterAll(async () => {
    resetAuditWriter();
    if (testClient) {
      await testClient.end();
    }
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore drop error
      }
      await adminClient.end();
    }
  });

  describe('1. Redaction & Schema Guardrail', () => {
    it('correctly matches sensitive name parts and avoids substring false positives', () => {
      // Must match
      expect(isSensitiveFieldName('password_hash')).toBe(true);
      expect(isSensitiveFieldName('passwordHash')).toBe(true);
      expect(isSensitiveFieldName('totp_secret_enc')).toBe(true);
      expect(isSensitiveFieldName('totpSecretEnc')).toBe(true);
      expect(isSensitiveFieldName('bank_account_enc')).toBe(true);
      expect(isSensitiveFieldName('code_hash')).toBe(true);
      expect(isSensitiveFieldName('refresh_token_hash')).toBe(true);
      expect(isSensitiveFieldName('temporaryPassword')).toBe(true);
      expect(isSensitiveFieldName('tempToken')).toBe(true);
      expect(isSensitiveFieldName('secret')).toBe(true);

      // Must NOT match non-sensitive words that contain substring "enc" or "hash"
      expect(isSensitiveFieldName('science')).toBe(false);
      expect(isSensitiveFieldName('fence')).toBe(false);
      expect(isSensitiveFieldName('agency')).toBe(false);
      expect(isSensitiveFieldName('silence')).toBe(false);
      expect(isSensitiveFieldName('benchmark')).toBe(false);
    });

    it('guardrail: verifies all sensitive Drizzle columns in @idmis/db are covered by deny-list', () => {
      const uncoveredColumns: string[] = [];

      // Introspect all exported Drizzle tables in schema
      for (const [exportName, exportVal] of Object.entries(schema)) {
        if (
          exportVal &&
          typeof exportVal === 'object' &&
          '_' in exportVal &&
          'columns' in (exportVal as unknown as { _: { columns: unknown } })._
        ) {
          const tableColumns = (
            exportVal as unknown as { _: { columns: Record<string, { name: string }> } }
          )._.columns;
          for (const [propName, colObj] of Object.entries(tableColumns)) {
            const colName = colObj.name;
            if (isSensitiveFieldName(colName)) {
              const inDenyList =
                SENSITIVE_DENY_LIST.has(colName) || SENSITIVE_DENY_LIST.has(propName);
              if (!inDenyList) {
                uncoveredColumns.push(`${exportName}.${colName}`);
              }
            }
          }
        }
      }

      expect(
        uncoveredColumns,
        `Found sensitive database columns not present in SENSITIVE_DENY_LIST: ${uncoveredColumns.join(', ')}`,
      ).toHaveLength(0);
    });

    it('replaces all sensitive fields with [REDACTED] in audit records', async () => {
      const payload = {
        email: 'officer@example.com',
        password: 'PlainSecretPassword123!',
        password_hash: '$argon2id$...',
        totpSecretEnc: 'encrypted_bytes',
        refresh_token_hash: 'hash_abc',
        bankAccountEnc: '1234567890',
        nested: {
          temporaryPassword: 'temp_secret_pwd',
          safeField: 'safeValue',
        },
      };

      const redacted = redactSensitiveFields(payload) as typeof payload;

      expect(redacted.email).toBe('officer@example.com');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.password_hash).toBe('[REDACTED]');
      expect(redacted.totpSecretEnc).toBe('[REDACTED]');
      expect(redacted.refresh_token_hash).toBe('[REDACTED]');
      expect(redacted.bankAccountEnc).toBe('[REDACTED]');
      expect(redacted.nested.temporaryPassword).toBe('[REDACTED]');
      expect(redacted.nested.safeField).toBe('safeValue');
    });
  });

  describe('2. Production Startup & Writer Enforcement', () => {
    it('throws a hard error in runInTransaction if audit writer is missing in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      resetAuditWriter();

      try {
        await expect(
          runInTransaction(
            async () => {
              return 'ok';
            },
            {
              db: testDb,
              audit: {
                action: 'create',
                entity: 'test_entity',
              },
            },
          ),
        ).rejects.toThrowError(
          /\[AuditWriterError\] Active audit writer is required in production/,
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        initAuditWriter();
      }
    });

    it('AuditModule fails bootstrap in production if no audit writer is registered', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      resetAuditWriter();

      try {
        const auditModule = new AuditModule();
        expect(() => auditModule.onApplicationBootstrap()).toThrowError(
          /\[AuditModuleError\] No audit writer registered on application bootstrap in production/,
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        initAuditWriter();
      }
    });
  });

  describe('3. Insert-Only Database Role Privileges (Security Rule)', () => {
    const APP_ROLE_NAME = `test_idmis_app_${Date.now()}`;
    const APP_ROLE_PASSWORD = 'TestAppPassword123!';
    let appClient: postgres.Sql;

    beforeAll(async () => {
      // Create test runtime role
      await testClient.unsafe(`
        CREATE ROLE "${APP_ROLE_NAME}" WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD}';
        GRANT USAGE ON SCHEMA "core" TO "${APP_ROLE_NAME}";
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "core" TO "${APP_ROLE_NAME}";
        -- Enforce insert-only on audit_log
        REVOKE ALL ON "core"."audit_log" FROM "${APP_ROLE_NAME}";
        GRANT SELECT, INSERT ON "core"."audit_log" TO "${APP_ROLE_NAME}";
      `);

      const appRoleUrl = testDbUrl.replace(
        /\/\/[^@]+@/,
        `//${APP_ROLE_NAME}:${APP_ROLE_PASSWORD}@`,
      );
      appClient = postgres(appRoleUrl);
    });

    afterAll(async () => {
      if (appClient) {
        await appClient.end();
      }
      try {
        await testClient.unsafe(`
          REASSIGN OWNED BY "${APP_ROLE_NAME}" TO CURRENT_USER;
          DROP OWNED BY "${APP_ROLE_NAME}";
          DROP ROLE IF EXISTS "${APP_ROLE_NAME}";
        `);
      } catch {
        // ignore cleanup error
      }
    });

    it('allows runtime app role to INSERT and SELECT on audit_log', async () => {
      const [inserted] = await appClient`
        INSERT INTO "core"."audit_log" ("actor_type", "action", "entity_type")
        VALUES ('user', 'create', 'test.entity')
        RETURNING "id", "action";
      `;
      expect(inserted.id).toBeDefined();
      expect(inserted.action).toBe('create');

      const selected = await appClient`
        SELECT * FROM "core"."audit_log" WHERE "id" = ${inserted.id};
      `;
      expect(selected.length).toBe(1);
    });

    it('strictly forbids runtime app role from UPDATE on audit_log (throws error 42501)', async () => {
      await expect(
        appClient`
          UPDATE "core"."audit_log"
          SET "action" = 'tampered'
          WHERE "action" = 'create';
        `,
      ).rejects.toThrowError(/permission denied for table audit_log/);
    });

    it('strictly forbids runtime app role from DELETE on audit_log (throws error 42501)', async () => {
      await expect(
        appClient`
          DELETE FROM "core"."audit_log"
          WHERE "action" = 'create';
        `,
      ).rejects.toThrowError(/permission denied for table audit_log/);
    });
  });
});
