import { Queue, Worker } from 'bullmq';
import { db } from '@idmis/db';
import { defaultSubscriberRegistry } from './dispatcher/registry';
import { dispatchBatch } from './dispatcher/dispatcher';
import { registerAuthzSubscribers } from './subscribers/authz.subscriber';
import { processSlisExportJob } from './jobs/slis-export.job';
import { refreshMaterializedViewsJob } from './jobs/slis-refresh.job';
import { processBlisPartitionJob } from './jobs/blis-partition.job';
import { processMeasurementCommitJob } from './jobs/blis-measurement-commit.job';
import { processPdfReportJob } from './jobs/pdf-report.job';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required when NODE_ENV=production');
  }
  if (!process.env.S3_ACCESS_KEY_ID) {
    throw new Error('S3_ACCESS_KEY_ID is required when NODE_ENV=production');
  }
  if (!process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3_SECRET_ACCESS_KEY is required when NODE_ENV=production');
  }
}

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

// 4. Repeatable BLIS Measurement Partition Queue & Worker
const blisPartitionQueueName = process.env.BLIS_PARTITION_QUEUE_NAME || 'blis-partition';
const blisPartitionQueue = new Queue(blisPartitionQueueName, {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

const blisPartitionWorker = new Worker(
  blisPartitionQueueName,
  async (job) => {
    return processBlisPartitionJob(job.data);
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

blisPartitionWorker.on('error', (err) => {
  console.warn('[BlisPartitionWorker] Error:', err.message);
});

// Schedule 1 December at 00:00 repeatable job
void blisPartitionQueue.upsertJobScheduler(
  'blis:ensure-partition-scheduler',
  {
    pattern: '0 0 1 12 *',
  },
  {
    name: 'blis:ensure-partition',
    data: {},
  },
);

// Run once at worker startup
void processBlisPartitionJob().catch((err) => {
  console.warn('[BlisPartition] Startup partition check failed:', err.message);
});

// 5. BLIS Measurement Commit Queue & Worker
const measurementCommitQueueName =
  process.env.BLIS_MEASUREMENT_COMMIT_QUEUE || 'blis-measurement-commit';
const measurementCommitQueue = new Queue(measurementCommitQueueName, {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

const measurementCommitWorker = new Worker(
  measurementCommitQueueName,
  async (job) => {
    return processMeasurementCommitJob(job.data);
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

measurementCommitWorker.on('error', (err) => {
  console.warn('[MeasurementCommitWorker] Error:', err.message);
});

// 6. PDF Report Queue & Worker
const pdfReportQueueName = process.env.REPORTS_PDF_QUEUE_NAME || 'reports-pdf';
const pdfReportConcurrency = parseInt(process.env.REPORTS_PDF_CONCURRENCY || '1', 10);

const pdfReportQueue = new Queue(pdfReportQueueName, {
  connection: {
    url: redisUrl,
    family: 0,
    lazyConnect: true,
  },
});

const pdfReportWorker = new Worker(
  pdfReportQueueName,
  async (job) => {
    return processPdfReportJob(job.data);
  },
  {
    connection: {
      url: redisUrl,
      family: 0,
      lazyConnect: true,
    },
    concurrency: pdfReportConcurrency,
  },
);

pdfReportWorker.on('error', (err) => {
  console.warn('[PdfReportWorker] Error:', err.message);
});

// 7. Initialize outbox dispatcher & subscribers
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
    await pdfReportWorker.close();
    await pdfReportQueue.close();
    await measurementCommitWorker.close();
    await measurementCommitQueue.close();
    await blisPartitionWorker.close();
    await blisPartitionQueue.close();
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
