import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateBasinMorphometryInputSchema,
  UpdateBasinMorphometryInputSchema,
  ListBasinMorphometryQuerySchema,
  type CreateBasinMorphometryInput,
  type UpdateBasinMorphometryInput,
  type ListBasinMorphometryQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { BlisAssetService } from '../services/blis-asset.service';

@Controller('blis/basin-morphometry')
export class BasinMorphometryController {
  constructor(private readonly assetService: BlisAssetService) {}

  @Get()
  @Can(permissions.BLIS_BASIN_READ)
  async listBasinMorphometry(
    @Query(new ZodValidationPipe(ListBasinMorphometryQuerySchema)) query: ListBasinMorphometryQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.assetService.listBasinMorphometry(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_BASIN_MANAGE)
  async createBasinMorphometry(
    @Body(new ZodValidationPipe(CreateBasinMorphometryInputSchema))
    input: CreateBasinMorphometryInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.createBasinMorphometry(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_BASIN_READ)
  async getBasinMorphometry(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.assetService.getBasinMorphometry(id, authz);
  }

  @Put(':id')
  @Can(permissions.BLIS_BASIN_MANAGE)
  async updateBasinMorphometry(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBasinMorphometryInputSchema))
    input: UpdateBasinMorphometryInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.updateBasinMorphometry(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.BLIS_BASIN_MANAGE)
  async deleteBasinMorphometry(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.assetService.deleteBasinMorphometry(id, expectedVersion, authz, user.id);
  }
}
