import { Injectable } from '@nestjs/common';
import { db, exportJob, file, eq } from '@idmis/db';

export interface CreateExportJobData {
  id: string;
  userId: string;
  dataset: string;
  filters?: Record<string, unknown>;
}

@Injectable()
export class ExportRepository {
  async createJob(data: CreateExportJobData) {
    const [created] = await db
      .insert(exportJob)
      .values({
        id: data.id,
        userId: data.userId,
        dataset: data.dataset,
        filters: data.filters ?? {},
        status: 'queued',
      })
      .returning();
    return created;
  }

  async findById(id: string) {
    const [found] = await db.select().from(exportJob).where(eq(exportJob.id, id)).limit(1);
    return found ?? null;
  }

  async findFileById(fileId: string) {
    const [found] = await db.select().from(file).where(eq(file.id, fileId)).limit(1);
    return found ?? null;
  }
}
