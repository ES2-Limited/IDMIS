import { EventEmitter } from 'node:events';

export interface RecomputeTriggerEvent {
  schemeId?: string | null;
  year?: number;
  quarter?: number;
}

export class DomainEventBus extends EventEmitter {
  emitRecompute(event: RecomputeTriggerEvent) {
    this.emit('recompute.trigger', event);
  }

  onRecompute(listener: (event: RecomputeTriggerEvent) => void) {
    this.on('recompute.trigger', listener);
  }

  offRecompute(listener: (event: RecomputeTriggerEvent) => void) {
    this.off('recompute.trigger', listener);
  }
}

export const eventBus = new DomainEventBus();
