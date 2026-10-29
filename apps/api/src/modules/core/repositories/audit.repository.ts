import { and, desc, eq, inArray, type SQL } from '@idmis/db';
import { auditLog, db } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type { RequestScope } from '@idmis/contracts';

export interface ListAuditLogsFilter {
  page?: number;
  limit?: number;
  entityType?: string;
  action?: string;
  actorUserId?: string;
  stateId?: string;
}

@Injectable()
export class AuditRepository {
  async listLogs(scope: RequestScope, filters: ListAuditLogsFilter = {}, txDb: DatabaseOrTx = db) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Tenant scope enforcement on stateId
    if (!scope.isNational) {
      if (!scope.stateIds || scope.stateIds.length === 0) {
        return { items: [], page, limit, total: 0 };
      }
      conditions.push(inArray(auditLog.stateId, scope.stateIds));
    }

    if (filters.entityType) {
      conditions.push(eq(auditLog.entityType, filters.entityType));
    }
    if (filters.action) {
      conditions.push(eq(auditLog.action, filters.action));
    }
    if (filters.actorUserId) {
      conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
    }
    if (filters.stateId) {
      conditions.push(eq(auditLog.stateId, filters.stateId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await txDb
      .select()
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.occurredAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows,
      page,
      limit,
    };
  }
}
