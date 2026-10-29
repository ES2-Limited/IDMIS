import { Injectable } from '@nestjs/common';
import { permissions, type ListAuditLogsQuery } from '@idmis/contracts';
import { AuditRepository } from '../repositories/audit.repository';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepo: AuditRepository) {}

  async listAuditLogs(query: ListAuditLogsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.CORE_AUDIT_READ);
    return this.auditRepo.listLogs(scope, {
      page: query.page,
      limit: query.limit,
      entityType: query.entityType,
      action: query.action,
      actorUserId: query.actorUserId,
      stateId: query.stateId,
    });
  }
}
