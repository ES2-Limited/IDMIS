import { Controller, Get, Param, Query, Inject, forwardRef } from '@nestjs/common';
import { permissions, DashboardQuerySchema } from '@idmis/contracts';
import { Can, CurrentAuthz, type UserAuthz } from '../../../platform/auth';
import { DashboardService } from '../services/dashboard.service';

@Controller('dashboards')
export class DashboardController {
  constructor(
    @Inject(forwardRef(() => DashboardService)) private readonly dashboardService: DashboardService,
  ) {}

  @Get('programme')
  @Can(permissions.DASHBOARD_VIEW)
  async getProgrammeDashboard(
    @Query() rawQuery: Record<string, unknown>,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    const query = DashboardQuerySchema.parse(rawQuery);
    return this.dashboardService.getProgrammeDashboard(query, authz);
  }

  @Get('state/:stateId')
  @Can(permissions.DASHBOARD_VIEW)
  async getStateDashboard(
    @Param('stateId') stateId: string,
    @Query() rawQuery: Record<string, unknown>,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    const query = DashboardQuerySchema.parse(rawQuery);
    return this.dashboardService.getStateDashboard(stateId, query, authz);
  }

  @Get('scheme/:schemeId')
  @Can(permissions.DASHBOARD_VIEW)
  async getSchemeDashboard(
    @Param('schemeId') schemeId: string,
    @Query() rawQuery: Record<string, unknown>,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    const query = DashboardQuerySchema.parse(rawQuery);
    return this.dashboardService.getSchemeDashboard(schemeId, query, authz);
  }
}
