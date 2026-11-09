import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql, type SQL, db, reportJob, file, auditLog } from '@idmis/db';
import type { ReportType, ReportStatus, ListReportsQuery } from '@idmis/contracts';
import type { DatabaseOrTx } from './file.repository';

export interface CreateReportJobData {
  id: string;
  userId: string;
  type: ReportType;
  params?: Record<string, unknown>;
  status?: ReportStatus;
}

@Injectable()
export class ReportRepository {
  async listJobsForUser(
    userId: string,
    query: ListReportsQuery,
    txDb: DatabaseOrTx = db,
  ): Promise<{
    items: (typeof reportJob.$inferSelect)[];
    nextCursor: string | null;
    total?: number;
    page?: number;
    limit?: number;
  }> {
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(reportJob.userId, userId)];

    if (query.status) {
      conditions.push(eq(reportJob.status, query.status));
    }
    if (query.type) {
      conditions.push(eq(reportJob.type, query.type));
    }

    if (query.page) {
      const page = query.page;
      const offset = (page - 1) * limit;

      const [totalRow] = await txDb
        .select({ count: sql<number>`count(*)::int` })
        .from(reportJob)
        .where(and(...conditions));
      const total = totalRow?.count ?? 0;

      const items = await txDb
        .select()
        .from(reportJob)
        .where(and(...conditions))
        .orderBy(desc(reportJob.createdAt), desc(reportJob.id))
        .limit(limit)
        .offset(offset);

      return {
        items,
        nextCursor: null,
        total,
        page,
        limit,
      };
    }

    if (query.cursor) {
      const cursorJob = await this.findById(query.cursor, txDb);
      if (cursorJob) {
        conditions.push(
          or(
            lt(reportJob.createdAt, cursorJob.createdAt),
            and(eq(reportJob.createdAt, cursorJob.createdAt), lt(reportJob.id, cursorJob.id)),
          )!,
        );
      }
    }

    const rows = await txDb
      .select()
      .from(reportJob)
      .where(and(...conditions))
      .orderBy(desc(reportJob.createdAt), desc(reportJob.id))
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      limit,
    };
  }

  async createJob(data: CreateReportJobData, txDb: DatabaseOrTx = db) {
    const [created] = await txDb
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

  async findById(id: string, txDb: DatabaseOrTx = db) {
    const [found] = await txDb.select().from(reportJob).where(eq(reportJob.id, id)).limit(1);
    return found ?? null;
  }

  async findFileById(fileId: string, txDb: DatabaseOrTx = db) {
    const [found] = await txDb.select().from(file).where(eq(file.id, fileId)).limit(1);
    return found ?? null;
  }

  async recordDownloadAudit(userId: string, reportId: string, txDb: DatabaseOrTx = db) {
    await txDb.insert(auditLog).values({
      actorType: 'user',
      actorUserId: userId,
      action: 'report.download',
      entityType: 'core.report',
      entityId: reportId,
      occurredAt: new Date().toISOString(),
    });
  }
}
