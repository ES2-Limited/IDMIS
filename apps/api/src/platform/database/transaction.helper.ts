import { Logger } from '@nestjs/common';
import { db as defaultDb } from '@idmis/db';

const logger = new Logger('TransactionHelper');

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'return'
  | 'import'
  | 'revert'
  | 'sign_in'
  | 'sign_in_failed'
  | 'assign';

export interface AuditRecordOptions {
  actorId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  deviceId?: string;
}

export type DbClient = typeof defaultDb;
export type TransactionClient = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export type AuditWriterHook = (tx: TransactionClient, audit: AuditRecordOptions) => Promise<void>;

let activeAuditWriter: AuditWriterHook | null = null;

/**
 * Registers an audit writer hook.
 * Task BE-1.5 will register the persistent `core.audit_log` database writer here.
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
    db?: DbClient;
    audit?: AuditRecordOptions;
  },
): Promise<T> {
  const database = options?.db ?? defaultDb;

  return database.transaction(async (tx) => {
    const result = await callback(tx);

    if (options?.audit) {
      if (activeAuditWriter) {
        await activeAuditWriter(tx, options.audit);
      } else {
        // Do not silently skip: log an explicit warning so audit requests are never ignored
        logger.warn(
          `Audit record requested for [${options.audit.action}] on ${options.audit.entity} (${options.audit.entityId ?? 'no id'}), but no audit writer is registered yet. Task BE-1.5 will bind the core.audit_log writer.`,
        );
      }
    }

    return result;
  });
}
