import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateCropProductionInputSchema,
  ListCropProductionsQuerySchema,
  UpdateCropProductionInputSchema,
  permissions,
  type CreateCropProductionInput,
  type ListCropProductionsQuery,
  type UpdateCropProductionInput,
} from '@idmis/contracts';
import { CropProductionService } from '../services/crop-production.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/crops')
export class CropProductionController {
  constructor(private readonly cropService: CropProductionService) {}

  @Get()
  @Can(permissions.SLIS_CROP_MANAGE)
  async listCropProductions(
    @Query(new ZodValidationPipe(ListCropProductionsQuerySchema)) query: ListCropProductionsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.cropService.listCropProductions(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_CROP_MANAGE)
  async createCropProduction(
    @Body(new ZodValidationPipe(CreateCropProductionInputSchema)) input: CreateCropProductionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cropService.createCropProduction(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_CROP_MANAGE)
  async getCropProduction(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.cropService.getCropProduction(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_CROP_MANAGE)
  async updateCropProduction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCropProductionInputSchema)) input: UpdateCropProductionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.cropService.updateCropProduction(id, version, input, authz, user.id);
  }
}
