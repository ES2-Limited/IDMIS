import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import {
  permissions,
  validateReportParams,
  type CreateReportInput,
  type CreateReportResponse,
  type ReportResponse,
  type ReportType,
  type ReportStatus,
} from '@idmis/contracts';
import { ReportRepository } from '../repositories/report.repository';
import { OrganisationRepository } from '../repositories/organisation.repository';
import { StorageService } from '../../../platform/storage/storage.service';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';

@Injectable()
export class ReportService implements OnModuleDestroy {
  private readonly logger = new Logger(ReportService.name);
  private reportQueue: Queue;

  constructor(
    private readonly reportRepo: ReportRepository,
    private readonly organisationRepo: OrganisationRepository,
    private readonly storageService: StorageService,
  ) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queueName = process.env.REPORTS_PDF_QUEUE_NAME || 'reports-pdf';
    this.reportQueue = new Queue(queueName, {
      connection: {
        url: redisUrl,
        family: 0,
        lazyConnect: true,
      },
    });

    this.reportQueue.on('error', (err) => {
      this.logger.warn(`BullMQ report queue error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    try {
      await this.reportQueue.close();
    } catch {
      // ignore clean exit
    }
  }

  async createReport(
    input: CreateReportInput,
    user: RequestUser,
    authz: UserAuthz,
  ): Promise<CreateReportResponse> {
    if (!authz.can(permissions.REPORT_GENERATE)) {
      throw new ForbiddenException('User lacks permission to generate reports');
    }

    let validatedParams: Record<string, unknown>;
    try {
      validatedParams = validateReportParams(input.type, input.params ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Invalid report parameters',
          errors: err.issues,
        });
      }
      throw new BadRequestException((err as Error).message);
    }

    const scope = authz.scopeFor(permissions.REPORT_GENERATE);

    // Enforce scope validation: return 404 for out of scope resources
    if (!scope.isNational) {
      if (input.type === 'scheme_report') {
        const schemeId = (validatedParams as { schemeId: string }).schemeId;
        const scheme = await this.organisationRepo.findById(schemeId);
        if (!scheme) {
          throw new NotFoundException(`Scheme not found`);
        }
        const allowedByScheme = scope.schemeIds.includes(schemeId);
        const allowedByState = scheme.stateIds?.some((sid) => scope.stateIds.includes(sid));
        if (!allowedByScheme && !allowedByState) {
          throw new NotFoundException(`Scheme not found`);
        }
      } else if (input.type === 'indicator_matrix') {
        const matrixParams = validatedParams as {
          scopeType: string;
          scopeId?: string;
        };
        if (matrixParams.scopeType === 'state' && matrixParams.scopeId) {
          if (!scope.stateIds.includes(matrixParams.scopeId)) {
            throw new NotFoundException(`Target state not found`);
          }
        } else if (matrixParams.scopeType === 'scheme' && matrixParams.scopeId) {
          if (!scope.schemeIds.includes(matrixParams.scopeId)) {
            throw new NotFoundException(`Target scheme not found`);
          }
        }
      } else if (input.type === 'dam_safety_summary') {
        const damParams = validatedParams as { stateId?: string; schemeId?: string };
        if (damParams.stateId && !scope.stateIds.includes(damParams.stateId)) {
          throw new NotFoundException(`Target state not found`);
        }
        if (damParams.schemeId && !scope.schemeIds.includes(damParams.schemeId)) {
          throw new NotFoundException(`Target scheme not found`);
        }
      }
    }

    const reportId = crypto.randomUUID();

    await this.reportRepo.createJob({
      id: reportId,
      userId: user.id,
      type: input.type,
      params: validatedParams,
      status: 'queued',
    });

    try {
      await this.reportQueue.add(
        'reports:pdf',
        {
          reportId,
          userId: user.id,
          type: input.type,
          params: validatedParams,
        },
        {
          jobId: reportId,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue BullMQ job for report ${reportId}: ${(err as Error).message}`,
      );
    }

    return {
      id: reportId,
      reportId,
      status: 'queued',
    };
  }

  async getReport(reportId: string, user: RequestUser): Promise<ReportResponse> {
    const job = await this.reportRepo.findById(reportId);
    if (!job) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    // Owner-only access (others return 404 to prevent resource discovery)
    if (job.userId !== user.id) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    let downloadUrl: string | null = null;
    let expiresAt: string | null = null;

    if (job.status === 'completed' && job.fileId) {
      const fileRow = await this.reportRepo.findFileById(job.fileId);
      if (fileRow) {
        // Link expires in 15 minutes (900 seconds)
        downloadUrl = await this.storageService.getDownloadUrl(
          fileRow.storageKey,
          900,
          fileRow.originalName ?? `${job.type}_${job.id}.pdf`,
        );
        expiresAt = new Date(Date.now() + 900 * 1000).toISOString();

        // Audited link issuance
        await this.reportRepo.recordDownloadAudit(user.id, reportId);
      }
    }

    return {
      id: job.id,
      type: job.type as ReportType,
      params: (job.params as Record<string, unknown>) ?? {},
      status: job.status as ReportStatus,
      downloadUrl,
      expiresAt,
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt,
      completedAt: job.completedAt ?? null,
    };
  }
}
