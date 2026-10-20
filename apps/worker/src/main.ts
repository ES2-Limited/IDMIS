import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Placeholder queue connection read from REDIS_URL
const placeholderQueue = new Queue('placeholder', {
  connection: {
    url: redisUrl,
    lazyConnect: true,
  },
});

placeholderQueue.on('error', (err) => {
  // Log and ignore unhandled connection error events when redis is offline
  console.warn('Queue connection error:', err.message);
});

console.log('worker started');

// Keep process active while listening
const keepAlive = setInterval(() => {}, 60000);

const shutdown = async () => {
  clearInterval(keepAlive);
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
