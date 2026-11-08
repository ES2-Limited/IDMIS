import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateReservoirInputSchema,
  UpdateReservoirInputSchema,
  ListReservoirsQuerySchema,
  type CreateReservoirInput,
  type UpdateReservoirInput,
  type ListReservoirsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { BlisAssetService } from '../services/blis-asset.service';

@Controller('blis/reservoirs')
export class ReservoirController {
  constructor(private readonly assetService: BlisAssetService) {}

  @Get()
  @Can(permissions.BLIS_BASIN_READ)
  async listReservoirs(
    @Query(new ZodValidationPipe(ListReservoirsQuerySchema)) query: ListReservoirsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.assetService.listReservoirs(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_DAM_MANAGE)
  async createReservoir(
    @Body(new ZodValidationPipe(CreateReservoirInputSchema)) input: CreateReservoirInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.createReservoir(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_BASIN_READ)
  async getReservoir(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.assetService.getReservoir(id, authz);
  }

  @Put(':id')
  @Can(permissions.BLIS_DAM_MANAGE)
  async updateReservoir(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateReservoirInputSchema)) input: UpdateReservoirInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetService.updateReservoir(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.BLIS_DAM_MANAGE)
  async deleteReservoir(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.assetService.deleteReservoir(id, expectedVersion, authz, user.id);
  }
}
