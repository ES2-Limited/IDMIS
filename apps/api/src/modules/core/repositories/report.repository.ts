import { Injectable } from '@nestjs/common';
import { db, reportJob, file, auditLog, eq } from '@idmis/db';
import type { ReportType, ReportStatus } from '@idmis/contracts';

export interface CreateReportJobData {
  id: string;
  userId: string;
  type: ReportType;
  params?: Record<string, unknown>;
  status?: ReportStatus;
}

@Injectable()
export class ReportRepository {
  async createJob(data: CreateReportJobData) {
    const [created] = await db
      .insert(reportJob)
      .values({
        id: data.id,
        userId: data.userId,
        type: data.type,
        params: data.params ?? {},
        status: data.status ?? 'queued',
      })
      .returning();
    return created;
  }

  async findById(id: string) {
    const [found] = await db.select().from(reportJob).where(eq(reportJob.id, id)).limit(1);
    return found ?? null;
  }

  async findFileById(fileId: string) {
    const [found] = await db.select().from(file).where(eq(file.id, fileId)).limit(1);
    return found ?? null;
  }

  async recordDownloadAudit(userId: string, reportId: string) {
    await db.insert(auditLog).values({
      actorType: 'user',
      actorUserId: userId,
      action: 'report.download',
      entityType: 'core.report',
      entityId: reportId,
      occurredAt: new Date().toISOString(),
    });
  }
}
