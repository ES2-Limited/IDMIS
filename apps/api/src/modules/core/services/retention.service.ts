import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { RetentionRunInput, RetentionRunResponse } from '@idmis/contracts';
import type { RequestUser } from '../../../platform/context';

@Injectable()
export class RetentionService implements OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private retentionQueue: Queue;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queueName = process.env.RETENTION_PURGE_QUEUE_NAME || 'retention-purge';
    this.retentionQueue = new Queue(queueName, {
      connection: {
        url: redisUrl,
        family: 0,
        lazyConnect: true,
      },
    });

    this.retentionQueue.on('error', (err) => {
      this.logger.warn(`BullMQ retention queue error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    try {
      await this.retentionQueue.close();
    } catch {
      // ignore clean exit
    }
  }

  getQueue(): Queue {
    return this.retentionQueue;
  }

  async triggerRetention(
    input: RetentionRunInput,
    user: RequestUser,
  ): Promise<RetentionRunResponse> {
    const dryRun = Boolean(input.dryRun);
    const job = await this.retentionQueue.add(
      'retention:purge',
      {
        dryRun,
        triggeredBy: user.id,
      },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return {
      jobId: String(job.id),
      dryRun,
    };
  }
}
