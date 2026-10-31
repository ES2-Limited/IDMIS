import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  permissions,
  type FarmersByScopeQuery,
  type FarmersByScopeResponse,
  type AreaByServiceQuery,
  type AreaByServiceResponse,
  type CroppingQuery,
  type CroppingResponse,
  type FeeRecoveryQuery,
  type FeeRecoveryResponse,
  type WuaSummaryQuery,
  type WuaSummaryResponse,
} from '@idmis/contracts';
import { ReportRepository } from '../repositories/report.repository';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class ReportService {
  constructor(private readonly reportRepo: ReportRepository) {}

  async getFarmersByScope(
    query: FarmersByScopeQuery,
    authz: UserAuthz,
  ): Promise<FarmersByScopeResponse> {
    const scope = authz.scopeFor(permissions.SLIS_REPORT_VIEW);
    return this.reportRepo.getFarmersByScope(scope, query);
  }

  async getAreaByService(
    query: AreaByServiceQuery,
    authz: UserAuthz,
  ): Promise<AreaByServiceResponse> {
    const scope = authz.scopeFor(permissions.SLIS_REPORT_VIEW);
    return this.reportRepo.getAreaByService(scope, query);
  }

  async getCropping(query: CroppingQuery, authz: UserAuthz): Promise<CroppingResponse> {
    const scope = authz.scopeFor(permissions.SLIS_REPORT_VIEW);
    return this.reportRepo.getCropping(scope, query);
  }

  async getFeeRecovery(query: FeeRecoveryQuery, authz: UserAuthz): Promise<FeeRecoveryResponse> {
    const scope = authz.scopeFor(permissions.SLIS_REPORT_VIEW);
    return this.reportRepo.getFeeRecovery(scope, query);
  }

  async getWuaSummaries(query: WuaSummaryQuery, authz: UserAuthz): Promise<WuaSummaryResponse> {
    const scope = authz.scopeFor(permissions.SLIS_REPORT_VIEW);
    return this.reportRepo.getWuaSummaries(scope, query);
  }

  async refreshViews(
    authz: UserAuthz,
  ): Promise<{ refreshed: boolean; refreshedAt: string | null }> {
    // Only slis_admin or users with report view permission / system admin may refresh views on-demand
    if (!authz.can(permissions.SLIS_REPORT_VIEW)) {
      throw new ForbiddenException('Only SLIS administrators may trigger report view refresh');
    }
    await this.reportRepo.refreshViews();
    const refreshedAt = await this.reportRepo.getLastRefreshedAt();
    return { refreshed: true, refreshedAt };
  }
}
