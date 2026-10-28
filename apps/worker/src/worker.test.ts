import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAuditArchiveJob } from './jobs/audit-archive.job';
import { SubscriberRegistry } from './dispatcher/registry';
import { registerAuthzSubscribers } from './subscribers/authz.subscriber';

vi.mock('@idmis/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@idmis/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Default: no setting
        }),
      }),
    },
  };
});

describe('Worker Unit Specification (BE-1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SubscriberRegistry', () => {
    it('registers and retrieves subscribers by event type', () => {
      const registry = new SubscriberRegistry();
      const mockHandler = vi.fn();
      registry.register('core.assignment.changed', 'test-handler', mockHandler, {
        timeoutMs: 5000,
      });

      const subs = registry.getSubscribers('core.assignment.changed');
      expect(subs).toHaveLength(1);
      expect(subs[0].handlerName).toBe('test-handler');
      expect(subs[0].timeoutMs).toBe(5000);

      expect(registry.getSubscribers('other.event')).toHaveLength(0);
    });

    it('registerAuthzSubscribers binds handlers for assignment and role permission changes', () => {
      const registry = new SubscriberRegistry();
      registerAuthzSubscribers(registry);

      expect(registry.getSubscribers('core.assignment.changed')).toHaveLength(1);
      expect(registry.getSubscribers('core.role_permission.changed')).toHaveLength(1);
    });
  });

  describe('Audit Archival Job (audit-archive.job)', () => {
    it('skips purge when audit_retention_months is not configured (null = keep forever)', async () => {
      const result = await runAuditArchiveJob();
      expect(result.status).toBe('skipped');
      expect(result.retentionMonths).toBeNull();
      expect(result.reason).toContain('keep forever');
    });
  });
});
