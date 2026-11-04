import { Controller, Get, Param, Query } from '@nestjs/common';
import { permissions } from '@idmis/contracts';
import { IndicatorService } from '../services/indicator.service';
import { Can } from '../../../platform/auth';

@Controller('me/indicators')
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listIndicators(@Query('frameworkId') frameworkId?: string) {
    return this.indicatorService.listIndicators(frameworkId);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getIndicator(@Param('id') id: string) {
    return this.indicatorService.getIndicator(id);
  }
}
