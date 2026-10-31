import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import { db as defaultDb } from '@idmis/db';
import type { AuditAction, ActorType } from '@idmis/contracts';

const logger = new Logger('TransactionHelper');

export type { AuditAction, ActorType };

export interface AuditRecordOptions {
  actorType?: ActorType;
  actorId?: string;
  actorUserId?: string;
  requestId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  stateId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

export type DbClient = typeof defaultDb;
export type TransactionClient = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export type AuditWriterHook = (tx: TransactionClient, audit: AuditRecordOptions) => Promise<void>;

let activeAuditWriter: AuditWriterHook | null = null;

export const txStorage = new AsyncLocalStorage<TransactionClient>();

/**
 * Registers an audit writer hook.
 * Task BE-1.5 registers the persistent `core.audit_log` database writer here.
 */
export function registerAuditWriter(writer: AuditWriterHook): void {
  activeAuditWriter = writer;
}

export function getActiveAuditWriter(): AuditWriterHook | null {
  return activeAuditWriter;
}

export function resetAuditWriter(): void {
  activeAuditWriter = null;
}

/**
 * Runs a business operation inside a database transaction.
 * Executes the configured audit writer inside the exact same transaction.
 */
export async function runInTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>,
  options?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db?: any;
    audit?: AuditRecordOptions;
  },
): Promise<T> {
  const activeTx = txStorage.getStore();
  const database = options?.db ?? (activeTx ? activeTx : defaultDb);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return database.transaction(async (tx: any) => {
    return txStorage.run(tx, async () => {
      const result = await callback(tx);

      if (options?.audit) {
        if (activeAuditWriter) {
          await activeAuditWriter(tx, options.audit);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error(
              `[AuditWriterError] Active audit writer is required in production for [${options.audit.action}] on ${options.audit.entity}`,
            );
          }
          logger.warn(
            `Audit record requested for [${options.audit.action}] on ${options.audit.entity} (${options.audit.entityId ?? 'no id'}), but no audit writer is registered yet.`,
          );
        }
      }

      return result;
    });
  });
}
