import { Controller, Get, Query } from '@nestjs/common';
import { ListAuditLogsQuerySchema, permissions, type ListAuditLogsQuery } from '@idmis/contracts';
import { AuditService } from '../services/audit.service';
import { Can, CurrentAuthz, type UserAuthz } from '../../../platform/auth';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Can(permissions.CORE_AUDIT_READ)
  async listAuditLogs(
    @Query(new ZodValidationPipe(ListAuditLogsQuerySchema)) query: ListAuditLogsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.auditService.listAuditLogs(query, authz);
  }
}
