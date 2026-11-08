import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateDamInputSchema,
  UpdateDamInputSchema,
  ListDamsQuerySchema,
  type CreateDamInput,
  type UpdateDamInput,
  type ListDamsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { BlisAssetService } from '../services/blis-asset.service';

@Controller('blis/dams')
export class DamController {
  constructor(private readonly assetService: BlisAssetService) {}

  @Get()
  @Can(permissions.BLIS_BASIN_READ)
  async listDams(
    @Query(new ZodValidationPipe(ListDamsQuerySchema)) query: ListDamsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.assetService.listDams(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_DAM_MANAGE)
  async createDam(
    @Body(new ZodValidationPipe(CreateDamInputSchema)) input: CreateDamInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.createDam(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_BASIN_READ)
  async getDam(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.assetService.getDam(id, authz);
  }

  @Put(':id')
  @Can(permissions.BLIS_DAM_MANAGE)
  async updateDam(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDamInputSchema)) input: UpdateDamInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.updateDam(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.BLIS_DAM_MANAGE)
  async deleteDam(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.assetService.deleteDam(id, expectedVersion, authz, user.id);
  }
}
