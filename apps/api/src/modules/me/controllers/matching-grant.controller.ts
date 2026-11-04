import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateMatchingGrantInputSchema,
  UpdateMatchingGrantInputSchema,
  ListMatchingGrantsQuerySchema,
  type CreateMatchingGrantInput,
  type UpdateMatchingGrantInput,
  type ListMatchingGrantsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { InstrumentsService } from '../services/instruments.service';

@Controller('me/grants')
export class MatchingGrantController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listMatchingGrants(
    @Query(new ZodValidationPipe(ListMatchingGrantsQuerySchema)) query: ListMatchingGrantsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.instrumentsService.listMatchingGrants(query, authz);
  }

  @Post()
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async createMatchingGrant(
    @Body(new ZodValidationPipe(CreateMatchingGrantInputSchema)) input: CreateMatchingGrantInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.createMatchingGrant(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getMatchingGrant(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.instrumentsService.getMatchingGrant(id, authz);
  }

  @Put(':id')
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async updateMatchingGrant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMatchingGrantInputSchema)) input: UpdateMatchingGrantInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.updateMatchingGrant(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async deleteMatchingGrant(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.instrumentsService.deleteMatchingGrant(id, expectedVersion, authz, user.id);
  }
}
