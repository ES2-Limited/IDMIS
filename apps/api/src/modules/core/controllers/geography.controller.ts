import { Controller, Get, Query } from '@nestjs/common';
import { permissions } from '@idmis/contracts';
import { GeographyService } from '../services/geography.service';
import { Can } from '../../../platform/auth';

@Controller('geography')
export class GeographyController {
  constructor(private readonly geoService: GeographyService) {}

  @Get('states')
  @Can(permissions.CORE_GEOGRAPHY_READ)
  async listStates() {
    return this.geoService.listStates();
  }

  @Get('lgas')
  @Can(permissions.CORE_GEOGRAPHY_READ)
  async listLgas(@Query('stateId') stateId?: string) {
    return this.geoService.listLgas(stateId);
  }

  @Get('wards')
  @Can(permissions.CORE_GEOGRAPHY_READ)
  async listWards(@Query('lgaId') lgaId?: string, @Query('stateId') stateId?: string) {
    return this.geoService.listWards(lgaId, stateId);
  }
}
