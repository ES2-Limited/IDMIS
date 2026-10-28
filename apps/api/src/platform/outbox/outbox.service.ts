import * as crypto from 'node:crypto';
import { outboxEvent } from '@idmis/db';
import type { TransactionClient } from '../database/transaction.helper';

export interface EnqueueOutboxEventInput {
  id?: string;
  eventType: string;
  eventVersion?: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
  availableAt?: string;
}

export async function enqueueOutboxEvent(
  tx: TransactionClient,
  event: EnqueueOutboxEventInput,
): Promise<string> {
  const eventId = event.id ?? crypto.randomUUID();
  await tx.insert(outboxEvent).values({
    id: eventId,
    eventType: event.eventType,
    eventVersion: event.eventVersion ?? 1,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    availableAt: event.availableAt ?? new Date().toISOString(),
  });
  return eventId;
}
