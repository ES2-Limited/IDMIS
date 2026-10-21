import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerAuditWriter,
  resetAuditWriter,
  getActiveAuditWriter,
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
});
