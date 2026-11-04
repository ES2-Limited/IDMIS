import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateStationInputSchema,
  UpdateStationInputSchema,
  ListStationsQuerySchema,
  type CreateStationInput,
  type UpdateStationInput,
  type ListStationsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { BlisAssetService } from '../services/blis-asset.service';

@Controller('blis/stations')
export class StationController {
  constructor(private readonly assetService: BlisAssetService) {}

  @Get()
  @Can(permissions.BLIS_BASIN_READ)
  async listStations(
    @Query(new ZodValidationPipe(ListStationsQuerySchema)) query: ListStationsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.assetService.listStations(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_STATION_MANAGE)
  async createStation(
    @Body(new ZodValidationPipe(CreateStationInputSchema)) input: CreateStationInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.createStation(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_BASIN_READ)
  async getStation(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.assetService.getStation(id, authz);
  }

  @Put(':id')
  @Can(permissions.BLIS_STATION_MANAGE)
  async updateStation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStationInputSchema)) input: UpdateStationInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.updateStation(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.BLIS_STATION_MANAGE)
  async deleteStation(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.assetService.deleteStation(id, expectedVersion, authz, user.id);
  }
}
