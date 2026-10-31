import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePlotInputSchema,
  ListPlotsQuerySchema,
  UpdatePlotInputSchema,
  permissions,
  type CreatePlotInput,
  type ListPlotsQuery,
  type UpdatePlotInput,
} from '@idmis/contracts';
import { PlotService } from '../services/plot.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/plots')
export class PlotController {
  constructor(private readonly plotService: PlotService) {}

  @Get()
  @Can(permissions.SLIS_PLOT_READ)
  async listPlots(
    @Query(new ZodValidationPipe(ListPlotsQuerySchema)) query: ListPlotsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.plotService.listPlots(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_PLOT_MANAGE)
  async createPlot(
    @Body(new ZodValidationPipe(CreatePlotInputSchema)) input: CreatePlotInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.plotService.createPlot(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_PLOT_READ)
  async getPlot(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.plotService.getPlot(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_PLOT_MANAGE)
  async updatePlot(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlotInputSchema)) input: UpdatePlotInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.plotService.updatePlot(id, version, input, authz, user.id);
  }
}
