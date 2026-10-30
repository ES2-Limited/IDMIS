import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateFarmInputSchema,
  ListFarmsQuerySchema,
  UpdateFarmInputSchema,
  permissions,
  type CreateFarmInput,
  type ListFarmsQuery,
  type UpdateFarmInput,
} from '@idmis/contracts';
import { FarmService } from '../services/farm.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/farms')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  @Get()
  @Can(permissions.SLIS_PLOT_READ)
  async listFarms(
    @Query(new ZodValidationPipe(ListFarmsQuerySchema)) query: ListFarmsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.farmService.listFarms(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_PLOT_MANAGE)
  async createFarm(
    @Body(new ZodValidationPipe(CreateFarmInputSchema)) input: CreateFarmInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmService.createFarm(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_PLOT_READ)
  async getFarm(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.farmService.getFarm(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_PLOT_MANAGE)
  async updateFarm(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFarmInputSchema)) input: UpdateFarmInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.farmService.updateFarm(id, version, input, authz, user.id);
  }
}
