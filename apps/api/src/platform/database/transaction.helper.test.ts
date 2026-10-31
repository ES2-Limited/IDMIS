import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, sql } from '@idmis/db';
import {
  registerAuditWriter,
  resetAuditWriter,
  getActiveAuditWriter,
  runInTransaction,
  AuditRecordOptions,
} from './transaction.helper';

describe('transaction.helper audit hook', () => {
  beforeEach(() => {
    resetAuditWriter();
  });

  it('exposes a registration hook for BE-1.5 audit writer', async () => {
    expect(getActiveAuditWriter()).toBeNull();

    const mockWriter = vi.fn().mockResolvedValue(undefined);
    registerAuditWriter(mockWriter);

    expect(getActiveAuditWriter()).toBe(mockWriter);

    const auditData: AuditRecordOptions = {
      action: 'create',
      entity: 'core.wua',
      entityId: '018f3a5e-0000-7000-8000-000000000001',
    };

    const writer = getActiveAuditWriter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writer?.({} as any, auditData);

    expect(mockWriter).toHaveBeenCalledWith({}, auditData);
  });

  it('nested runInTransaction: inner throw + outer catch -> outer commits, inner rolled back', async () => {
    await db.execute(
      sql`CREATE TEMP TABLE IF NOT EXISTS test_nested_tx (id text primary key, val text);`,
    );
    await db.execute(sql`DELETE FROM test_nested_tx;`);

    await runInTransaction(async (outerTx) => {
      await outerTx.execute(sql`INSERT INTO test_nested_tx VALUES ('1', 'outer-val');`);

      try {
        await runInTransaction(async (innerTx) => {
          await innerTx.execute(sql`INSERT INTO test_nested_tx VALUES ('2', 'inner-val');`);
          throw new Error('inner rollback');
        });
      } catch (err) {
        expect((err as Error).message).toBe('inner rollback');
      }

      await outerTx.execute(sql`INSERT INTO test_nested_tx VALUES ('3', 'outer-after-val');`);
    });

    const rows = await db.execute(sql`SELECT id, val FROM test_nested_tx ORDER BY id;`);
    expect(rows).toEqual([
      { id: '1', val: 'outer-val' },
      { id: '3', val: 'outer-after-val' },
    ]);
  });

  it('nested runInTransaction: outer failure rolls back inner success and outer writes', async () => {
    await db.execute(
      sql`CREATE TEMP TABLE IF NOT EXISTS test_nested_tx2 (id text primary key, val text);`,
    );
    await db.execute(sql`DELETE FROM test_nested_tx2;`);

    try {
      await runInTransaction(async (outerTx) => {
        await outerTx.execute(sql`INSERT INTO test_nested_tx2 VALUES ('1', 'outer-val');`);

        await runInTransaction(async (innerTx) => {
          await innerTx.execute(sql`INSERT INTO test_nested_tx2 VALUES ('2', 'inner-val');`);
        });

        throw new Error('outer rollback');
      });
    } catch (err) {
      expect((err as Error).message).toBe('outer rollback');
    }

    const rows = await db.execute(sql`SELECT id, val FROM test_nested_tx2;`);
    expect(rows).toEqual([]);
  });
});
