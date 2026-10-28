import { Queue } from 'bullmq';
import { db } from '@idmis/db';
import { defaultSubscriberRegistry } from './dispatcher/registry';
import { dispatchBatch } from './dispatcher/dispatcher';
import { registerAuthzSubscribers } from './subscribers/authz.subscriber';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// 1. Placeholder queue connection read from REDIS_URL
const placeholderQueue = new Queue('placeholder', {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

placeholderQueue.on('error', (err) => {
  console.warn('Queue connection error:', err.message);
});

// 2. Initialize outbox dispatcher & subscribers
registerAuthzSubscribers(defaultSubscriberRegistry);

let isRunning = true;
let pollTimeout: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '1000', 10);

async function runDispatcherLoop() {
  while (isRunning) {
    try {
      await dispatchBatch(db, defaultSubscriberRegistry);
    } catch (err) {
      console.error('[WorkerDispatcher] Batch execution error:', err);
    }

    if (!isRunning) break;
    await new Promise((resolve) => {
      pollTimeout = setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
}

console.log('Worker started. Starting outbox event dispatcher loop...');
void runDispatcherLoop();

const shutdown = async () => {
  isRunning = false;
  if (pollTimeout) clearTimeout(pollTimeout);
  try {
    await placeholderQueue.close();
  } catch {
    // ignore clean exit error
  }
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});
