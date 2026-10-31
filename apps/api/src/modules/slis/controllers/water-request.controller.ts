import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import {
  CreateWaterRequestInputSchema,
  DecideWaterRequestInputSchema,
  ListWaterRequestsQuerySchema,
  permissions,
  type CreateWaterRequestInput,
  type DecideWaterRequestInput,
  type ListWaterRequestsQuery,
} from '@idmis/contracts';
import { WaterRequestService } from '../services/water-request.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/water-requests')
export class WaterRequestController {
  constructor(private readonly waterRequestService: WaterRequestService) {}

  @Get()
  @Can(permissions.SLIS_WATER_REQUEST_READ)
  async listWaterRequests(
    @Query(new ZodValidationPipe(ListWaterRequestsQuerySchema)) query: ListWaterRequestsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.waterRequestService.listWaterRequests(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_WATER_REQUEST_CREATE)
  async createWaterRequest(
    @Body(new ZodValidationPipe(CreateWaterRequestInputSchema)) input: CreateWaterRequestInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.waterRequestService.createWaterRequest(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_WATER_REQUEST_READ)
  async getWaterRequest(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.waterRequestService.getWaterRequest(id, authz);
  }

  @Post(':id/decide')
  @Can(permissions.SLIS_WATER_REQUEST_DECIDE)
  async decideWaterRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DecideWaterRequestInputSchema)) input: DecideWaterRequestInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.waterRequestService.decideWaterRequest(id, version, input, authz, user.id);
  }
}
