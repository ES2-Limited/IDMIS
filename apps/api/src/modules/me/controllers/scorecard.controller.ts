import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateScorecardInputSchema,
  UpdateScorecardInputSchema,
  ListScorecardsQuerySchema,
  type CreateScorecardInput,
  type UpdateScorecardInput,
  type ListScorecardsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { InstrumentsService } from '../services/instruments.service';

@Controller('me/scorecards')
export class ScorecardController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listScorecards(
    @Query(new ZodValidationPipe(ListScorecardsQuerySchema)) query: ListScorecardsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.instrumentsService.listScorecards(query, authz);
  }

  @Post()
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async createScorecard(
    @Body(new ZodValidationPipe(CreateScorecardInputSchema)) input: CreateScorecardInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.createScorecard(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getScorecard(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.instrumentsService.getScorecard(id, authz);
  }

  @Put(':id')
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async updateScorecard(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScorecardInputSchema)) input: UpdateScorecardInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.updateScorecard(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.ME_INSTRUMENTS_MANAGE)
  async deleteScorecard(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.instrumentsService.deleteScorecard(id, expectedVersion, authz, user.id);
  }
}
