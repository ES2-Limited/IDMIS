import type { EventEnvelope } from '@idmis/contracts';

export type EventHandler<T = Record<string, unknown>> = (
  payload: T,
  envelope: EventEnvelope<T>,
) => Promise<void>;

export interface SubscriberRegistration {
  handlerName: string;
  handler: (payload: unknown, envelope: EventEnvelope<unknown>) => Promise<void>;
  timeoutMs: number;
}

export class SubscriberRegistry {
  private readonly handlers = new Map<string, SubscriberRegistration[]>();

  register<T = Record<string, unknown>>(
    eventType: string,
    handlerName: string,
    handler: EventHandler<T>,
    options?: { timeoutMs?: number },
  ): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push({
      handlerName,
      handler: handler as unknown as (
        payload: unknown,
        envelope: EventEnvelope<unknown>,
      ) => Promise<void>,
      timeoutMs: options?.timeoutMs ?? 10_000,
    });
    this.handlers.set(eventType, existing);
  }

  getSubscribers(eventType: string): SubscriberRegistration[] {
    return this.handlers.get(eventType) ?? [];
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const defaultSubscriberRegistry = new SubscriberRegistry();
