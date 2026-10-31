import { Controller, Get, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  permissions,
  FarmersByScopeQuerySchema,
  AreaByServiceQuerySchema,
  CroppingQuerySchema,
  FeeRecoveryQuerySchema,
  WuaSummaryQuerySchema,
  type FarmersByScopeQuery,
  type AreaByServiceQuery,
  type CroppingQuery,
  type FeeRecoveryQuery,
  type WuaSummaryQuery,
} from '@idmis/contracts';
import { ReportService } from '../services/report.service';
import { Can, CurrentAuthz, type UserAuthz } from '../../../platform/auth';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('farmers-by-scope')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getFarmersByScope(
    @Query(new ZodValidationPipe(FarmersByScopeQuerySchema)) query: FarmersByScopeQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getFarmersByScope(query, authz);
  }

  @Get('farmers-by-sector')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getFarmersBySector(
    @Query(new ZodValidationPipe(FarmersByScopeQuerySchema)) query: FarmersByScopeQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getFarmersByScope(query, authz);
  }

  @Get('area-by-service')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getAreaByService(
    @Query(new ZodValidationPipe(AreaByServiceQuerySchema)) query: AreaByServiceQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getAreaByService(query, authz);
  }

  @Get('cropping')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getCropping(
    @Query(new ZodValidationPipe(CroppingQuerySchema)) query: CroppingQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getCropping(query, authz);
  }

  @Get('fee-recovery')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getFeeRecovery(
    @Query(new ZodValidationPipe(FeeRecoveryQuerySchema)) query: FeeRecoveryQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getFeeRecovery(query, authz);
  }

  @Get('fee-collection-vs-billing')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getFeeCollectionVsBilling(
    @Query(new ZodValidationPipe(FeeRecoveryQuerySchema)) query: FeeRecoveryQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getFeeRecovery(query, authz);
  }

  @Get('wua-summaries')
  @Can(permissions.SLIS_REPORT_VIEW)
  async getWuaSummaries(
    @Query(new ZodValidationPipe(WuaSummaryQuerySchema)) query: WuaSummaryQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reportService.getWuaSummaries(query, authz);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.SLIS_REPORT_VIEW)
  async refreshViews(@CurrentAuthz() authz: UserAuthz) {
    return this.reportService.refreshViews(authz);
  }
}
