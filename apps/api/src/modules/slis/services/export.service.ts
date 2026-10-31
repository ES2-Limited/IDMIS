import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import crypto from 'node:crypto';
import {
  permissions,
  type CreateExportInput,
  type CreateExportResponse,
  type ExportStatusResponse,
} from '@idmis/contracts';
import { ExportRepository } from '../repositories/export.repository';
import { StorageService } from '../../../platform/storage/storage.service';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';

@Injectable()
export class ExportService implements OnModuleDestroy {
  private readonly logger = new Logger(ExportService.name);
  private exportQueue: Queue;

  constructor(
    private readonly exportRepo: ExportRepository,
    private readonly storageService: StorageService,
  ) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queueName = process.env.SLIS_EXPORT_QUEUE_NAME || 'export-slis';
    this.exportQueue = new Queue(queueName, {
      connection: {
        url: redisUrl,
        family: 0,
        lazyConnect: true,
      },
    });

    this.exportQueue.on('error', (err) => {
      this.logger.warn(`BullMQ export queue error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    try {
      await this.exportQueue.close();
    } catch {
      // ignore clean exit
    }
  }

  async createExport(
    input: CreateExportInput,
    user: RequestUser,
    authz: UserAuthz,
  ): Promise<CreateExportResponse> {
    if (!authz.can(permissions.SLIS_EXPORT_GENERATE)) {
      throw new ForbiddenException('User lacks permission to generate exports');
    }
    const exportId = crypto.randomUUID();

    await this.exportRepo.createJob({
      id: exportId,
      userId: user.id,
      dataset: input.dataset,
      filters: input.filters,
    });

    try {
      await this.exportQueue.add(
        'export',
        {
          exportId,
          userId: user.id,
          dataset: input.dataset,
          filters: input.filters ?? {},
        },
        {
          jobId: exportId,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue BullMQ job for export ${exportId}: ${(err as Error).message}`,
      );
    }

    return {
      exportId,
      status: 'queued',
      message: 'Export enqueued successfully',
    };
  }

  async getExport(
    exportId: string,
    user: RequestUser,
    authz: UserAuthz,
  ): Promise<ExportStatusResponse> {
    const job = await this.exportRepo.findById(exportId);
    if (!job) {
      throw new NotFoundException(`Export job ${exportId} not found`);
    }

    if (job.userId !== user.id && !authz.can(permissions.SLIS_EXPORT_GENERATE)) {
      throw new ForbiddenException('Cannot access export jobs created by another user');
    }

    let downloadUrl: string | null = null;
    let expiresAt: string | null = null;

    if (job.status === 'completed' && job.fileId) {
      const fileRow = await this.exportRepo.findFileById(job.fileId);
      if (fileRow) {
        downloadUrl = await this.storageService.getDownloadUrl(
          fileRow.storageKey,
          900, // 15 minutes
          fileRow.originalName ?? `${job.dataset}_export.xlsx`,
        );
        expiresAt = new Date(Date.now() + 900 * 1000).toISOString();
      }
    }

    return {
      exportId: job.id,
      dataset: job.dataset,
      status: job.status as 'queued' | 'processing' | 'completed' | 'failed',
      rowCount: job.rowCount ?? null,
      downloadUrl,
      expiresAt,
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt,
      completedAt: job.completedAt ?? null,
    };
  }
}
