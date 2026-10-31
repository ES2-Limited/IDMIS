import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateHouseholdInputSchema,
  ListHouseholdsQuerySchema,
  UpdateHouseholdInputSchema,
  permissions,
  type CreateHouseholdInput,
  type ListHouseholdsQuery,
  type UpdateHouseholdInput,
} from '@idmis/contracts';
import { HouseholdService } from '../services/household.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/households')
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get()
  @Can(permissions.SLIS_HOUSEHOLD_MANAGE)
  async listHouseholds(
    @Query(new ZodValidationPipe(ListHouseholdsQuerySchema)) query: ListHouseholdsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.householdService.listHouseholds(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_HOUSEHOLD_MANAGE)
  async createHousehold(
    @Body(new ZodValidationPipe(CreateHouseholdInputSchema)) input: CreateHouseholdInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.householdService.createHousehold(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_HOUSEHOLD_MANAGE)
  async getHousehold(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.householdService.getHousehold(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_HOUSEHOLD_MANAGE)
  async updateHousehold(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateHouseholdInputSchema)) input: UpdateHouseholdInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.householdService.updateHousehold(id, version, input, authz, user.id);
  }
}
