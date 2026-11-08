import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateBasinInputSchema,
  UpdateBasinInputSchema,
  ListBasinsQuerySchema,
  type CreateBasinInput,
  type UpdateBasinInput,
  type ListBasinsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { BlisAssetService } from '../services/blis-asset.service';

@Controller('blis/basins')
export class BasinController {
  constructor(private readonly assetService: BlisAssetService) {}

  @Get()
  @Can(permissions.BLIS_BASIN_READ)
  async listBasins(
    @Query(new ZodValidationPipe(ListBasinsQuerySchema)) query: ListBasinsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.assetService.listBasins(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_BASIN_MANAGE)
  async createBasin(
    @Body(new ZodValidationPipe(CreateBasinInputSchema)) input: CreateBasinInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.createBasin(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_BASIN_READ)
  async getBasin(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.assetService.getBasin(id, authz);
  }

  @Put(':id')
  @Can(permissions.BLIS_BASIN_MANAGE)
  async updateBasin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBasinInputSchema)) input: UpdateBasinInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.updateBasin(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.BLIS_BASIN_MANAGE)
  async deleteBasin(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.assetService.deleteBasin(id, expectedVersion, authz, user.id);
  }
}
