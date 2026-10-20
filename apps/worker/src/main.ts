import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsedUrl = new URL(redisUrl);

// Placeholder queue connection read from REDIS_URL
const placeholderQueue = new Queue('placeholder', {
  connection: {
    host: parsedUrl.hostname || 'localhost',
    port: Number(parsedUrl.port) || 6379,
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    lazyConnect: true,
  },
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
