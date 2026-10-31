import { Queue, Worker } from 'bullmq';
import { db } from '@idmis/db';
import { defaultSubscriberRegistry } from './dispatcher/registry';
import { dispatchBatch } from './dispatcher/dispatcher';
import { registerAuthzSubscribers } from './subscribers/authz.subscriber';
import { processSlisExportJob } from './jobs/slis-export.job';
import { refreshMaterializedViewsJob } from './jobs/slis-refresh.job';

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

// 2. SLIS Export Queue & Worker
const exportQueueName = process.env.SLIS_EXPORT_QUEUE_NAME || 'export-slis';
const exportQueue = new Queue(exportQueueName, {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

const exportWorker = new Worker(
  exportQueueName,
  async (job) => {
    return processSlisExportJob(job.data);
  },
  {
    connection: {
      url: redisUrl,
      family: 0,
      lazyConnect: true,
    },
    concurrency: 2,
  },
);

exportWorker.on('error', (err) => {
  console.warn('[ExportWorker] Error:', err.message);
});

// 3. Repeatable Refresh Materialized Views Queue & Worker
const refreshQueueName = process.env.SLIS_REFRESH_QUEUE_NAME || 'slis-refresh-mv';
const refreshQueue = new Queue(refreshQueueName, {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

const refreshWorker = new Worker(
  refreshQueueName,
  async () => {
    return refreshMaterializedViewsJob();
  },
  {
    connection: {
      url: redisUrl,
      family: 0,
      lazyConnect: true,
    },
    concurrency: 1,
  },
);

refreshWorker.on('error', (err) => {
  console.warn('[RefreshWorker] Error:', err.message);
});

// Schedule 15-minute repeatable job (configurable via env)
const REFRESH_INTERVAL_MS = parseInt(process.env.SLIS_MV_REFRESH_INTERVAL_MS || '900000', 10);

void refreshQueue.upsertJobScheduler(
  'slis:refresh-mv-scheduler',
  {
    every: REFRESH_INTERVAL_MS,
  },
  {
    name: 'slis:refresh-mv',
    data: {},
  },
);

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

console.log('worker started. Starting outbox event dispatcher loop...');
void runDispatcherLoop();

const shutdown = async () => {
  isRunning = false;
  if (pollTimeout) clearTimeout(pollTimeout);
  try {
    await exportWorker.close();
    await exportQueue.close();
    await refreshWorker.close();
    await refreshQueue.close();
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
