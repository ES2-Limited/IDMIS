import { auditLog } from '@idmis/db';
import type { AuditRecordOptions, TransactionClient } from '../database/transaction.helper';
import { registerAuditWriter } from '../database/transaction.helper';
import { redactSensitiveFields } from './redaction';

export async function persistentAuditWriter(
  tx: TransactionClient,
  audit: AuditRecordOptions,
): Promise<void> {
  const actorType = audit.actorType ?? (audit.actorUserId || audit.actorId ? 'user' : 'system');
  const actorUserId = audit.actorUserId ?? audit.actorId ?? null;

  const changes =
    audit.before !== undefined || audit.after !== undefined
      ? {
          before: audit.before !== undefined ? redactSensitiveFields(audit.before) : undefined,
          after: audit.after !== undefined ? redactSensitiveFields(audit.after) : undefined,
        }
      : null;

  await tx.insert(auditLog).values({
    occurredAt: new Date().toISOString(),
    actorType,
    actorUserId,
    requestId: audit.requestId ?? null,
    action: audit.action,
    entityType: audit.entity,
    entityId: audit.entityId ?? null,
    stateId: audit.stateId ?? null,
    changes,
    ip: audit.ip ?? null,
    userAgent: audit.userAgent ?? null,
  });
}

/**
 * Initializes and binds the database audit writer hook.
 */
export function initAuditWriter(): void {
  registerAuditWriter(persistentAuditWriter);
}
