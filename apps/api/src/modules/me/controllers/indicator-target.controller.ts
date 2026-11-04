import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  permissions,
  CreateIndicatorTargetInputSchema,
  UpdateIndicatorTargetInputSchema,
  ListIndicatorTargetsQuerySchema,
  type CreateIndicatorTargetInput,
  type UpdateIndicatorTargetInput,
  type ListIndicatorTargetsQuery,
} from '@idmis/contracts';
import { IndicatorTargetService } from '../services/indicator-target.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('me/targets')
export class IndicatorTargetController {
  constructor(private readonly targetService: IndicatorTargetService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listTargets(
    @Query(new ZodValidationPipe(ListIndicatorTargetsQuerySchema)) query: ListIndicatorTargetsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.targetService.listTargets(query, authz);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getTarget(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.targetService.getTarget(id, authz);
  }

  @Post()
  @Can(permissions.ME_TARGET_MANAGE)
  async createTarget(
    @Body(new ZodValidationPipe(CreateIndicatorTargetInputSchema))
    input: CreateIndicatorTargetInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.targetService.createTarget(input, authz, user.id);
  }

  @Put(':id')
  @Can(permissions.ME_TARGET_MANAGE)
  async updateTarget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateIndicatorTargetInputSchema))
    input: UpdateIndicatorTargetInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.targetService.updateTarget(id, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.ME_TARGET_MANAGE)
  async deleteTarget(
    @Param('id') id: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.targetService.deleteTarget(id, authz, user.id);
  }
}
