import { db as defaultDb, outboxEvent, outboxConsumption, eq, and, sql } from '@idmis/db';
import { KNOWN_EVENT_TYPES, type EventEnvelope } from '@idmis/contracts';
import { SubscriberRegistry } from './registry';

export const MAX_ATTEMPTS = 12;
export const BATCH_SIZE = 20;

export interface DispatcherResult {
  processed: number;
  delivered: number;
  deadLettered: number;
  failed: number;
}

export async function dispatchBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbInstance: any = defaultDb,
  registry: SubscriberRegistry,
  batchSize = BATCH_SIZE,
): Promise<DispatcherResult> {
  const result: DispatcherResult = {
    processed: 0,
    delivered: 0,
    deadLettered: 0,
    failed: 0,
  };

  // 1. Fetch eligible batch using FOR UPDATE SKIP LOCKED
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await dbInstance.transaction(async (tx: any) => {
    const rawRows = (await tx.execute(sql`
      SELECT * FROM "core"."outbox_event"
      WHERE "delivered_at" IS NULL
        AND "dead_at" IS NULL
        AND "available_at" <= ${nowIso}::timestamptz
      ORDER BY "available_at" ASC, "occurred_at" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `)) as unknown as Record<string, unknown>[];

    return rawRows.map((r) => ({
      id: r.id as string,
      eventType: (r.event_type ?? r.eventType) as string,
      eventVersion: Number(r.event_version ?? r.eventVersion ?? 1),
      aggregateType: (r.aggregate_type ?? r.aggregateType) as string,
      aggregateId: (r.aggregate_id ?? r.aggregateId) as string,
      payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<
        string,
        unknown
      >,
      occurredAt: (r.occurred_at ?? r.occurredAt) as string,
      availableAt: (r.available_at ?? r.availableAt) as string,
      attempts: Number(r.attempts ?? 0),
      lastError: (r.last_error ?? r.lastError ?? null) as string | null,
      deliveredAt: (r.delivered_at ?? r.deliveredAt ?? null) as string | null,
      deadAt: (r.dead_at ?? r.deadAt ?? null) as string | null,
    }));
  });

  if (!events || events.length === 0) {
    return result;
  }

  // 2. Process each event
  for (const event of events) {
    result.processed++;
    const eventType = event.eventType;

    // Rule 2A: Event type NOT in contracts catalogue -> immediate dead-letter + error log
    const isKnown = (KNOWN_EVENT_TYPES as readonly string[]).includes(eventType);
    if (!isKnown) {
      console.error(
        `[OutboxDispatcher] Dead-lettering event ${event.id}: unknown event type '${eventType}' not in contracts catalogue`,
      );
      await dbInstance
        .update(outboxEvent)
        .set({
          deadAt: new Date().toISOString(),
          lastError: `Unknown event type '${eventType}' not in contracts catalogue`,
        })
        .where(eq(outboxEvent.id, event.id));

      result.deadLettered++;
      continue;
    }

    // Rule 2B: Event type IN catalogue with NO subscribers -> mark delivered (noop)
    const subscribers = registry.getSubscribers(eventType);
    if (subscribers.length === 0) {
      await dbInstance
        .update(outboxEvent)
        .set({
          deliveredAt: new Date().toISOString(),
        })
        .where(eq(outboxEvent.id, event.id));

      result.delivered++;
      continue;
    }

    // Rule 2C: Subscribers exist -> execute each with timeout and deduplication
    let eventFailed = false;
    let failureError: Error | null = null;

    const envelope: EventEnvelope = {
      id: event.id,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: (event.payload as Record<string, unknown>) ?? {},
      occurredAt: new Date(event.occurredAt),
    };

    for (const subscriber of subscribers) {
      // Check deduplication
      const [alreadyConsumed] = await dbInstance
        .select()
        .from(outboxConsumption)
        .where(
          and(
            eq(outboxConsumption.eventId, event.id),
            eq(outboxConsumption.handlerName, subscriber.handlerName),
          ),
        );

      if (alreadyConsumed) {
        continue;
      }

      // Execute with per-handler timeout
      try {
        let timer: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `Handler '${subscriber.handlerName}' timed out after ${subscriber.timeoutMs}ms`,
              ),
            );
          }, subscriber.timeoutMs);
        });

        try {
          await Promise.race([subscriber.handler(envelope.payload, envelope), timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }

        // Write consumption record ONLY after successful execution (supporting non-DB side effects)
        await dbInstance
          .insert(outboxConsumption)
          .values({
            eventId: event.id,
            handlerName: subscriber.handlerName,
            consumedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
      } catch (err) {
        eventFailed = true;
        failureError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[OutboxDispatcher] Handler '${subscriber.handlerName}' failed for event ${event.id} (${eventType}):`,
          failureError.message,
        );
        break; // Stop executing remaining subscribers for this attempt
      }
    }

    if (!eventFailed) {
      // All subscribers succeeded
      await dbInstance
        .update(outboxEvent)
        .set({
          deliveredAt: new Date().toISOString(),
          lastError: null,
        })
        .where(eq(outboxEvent.id, event.id));

      result.delivered++;
    } else {
      // Handler failure: backoff or dead letter
      const nextAttempts = event.attempts + 1;
      const errorMessage = failureError?.message ?? 'Unknown handler error';

      if (nextAttempts >= MAX_ATTEMPTS) {
        console.error(
          `[OutboxDispatcher] Event ${event.id} (${eventType}) reached max attempts (${MAX_ATTEMPTS}); dead-lettering.`,
        );
        await dbInstance
          .update(outboxEvent)
          .set({
            attempts: nextAttempts,
            deadAt: new Date().toISOString(),
            lastError: errorMessage,
          })
          .where(eq(outboxEvent.id, event.id));

        result.deadLettered++;
      } else {
        // Backoff: min(2^(attempts-1), 300) seconds
        const backoffSeconds = Math.min(Math.pow(2, nextAttempts - 1), 300);
        const nextAvailableAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await dbInstance
          .update(outboxEvent)
          .set({
            attempts: nextAttempts,
            availableAt: nextAvailableAt,
            lastError: errorMessage,
          })
          .where(eq(outboxEvent.id, event.id));

        result.failed++;
      }
    }
  }

  return result;
}
