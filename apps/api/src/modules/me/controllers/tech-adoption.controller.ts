import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  permissions,
  CreateTechAdoptionInputSchema,
  UpdateTechAdoptionInputSchema,
  ListTechAdoptionsQuerySchema,
  ApproveTechAdoptionInputSchema,
  ReturnTechAdoptionInputSchema,
  type CreateTechAdoptionInput,
  type UpdateTechAdoptionInput,
  type ListTechAdoptionsQuery,
  type ApproveTechAdoptionInput,
  type ReturnTechAdoptionInput,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { InstrumentsService } from '../services/instruments.service';

@Controller('me/tech-adoption')
export class TechAdoptionController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listTechAdoptions(
    @Query(new ZodValidationPipe(ListTechAdoptionsQuerySchema)) query: ListTechAdoptionsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.instrumentsService.listTechAdoptions(query, authz);
  }

  @Post()
  @Can(permissions.ME_ADOPTION_RECORD)
  async createTechAdoption(
    @Body(new ZodValidationPipe(CreateTechAdoptionInputSchema)) input: CreateTechAdoptionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.createTechAdoption(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getTechAdoption(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.instrumentsService.getTechAdoption(id, authz);
  }

  @Put(':id')
  @Can(permissions.ME_ADOPTION_RECORD)
  async updateTechAdoption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTechAdoptionInputSchema)) input: UpdateTechAdoptionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.updateTechAdoption(id, input.version, input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.ME_ADOPTION_RECORD)
  async deleteTechAdoption(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const expectedVersion = parseInt(version, 10);
    return this.instrumentsService.deleteTechAdoption(id, expectedVersion, authz, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.ME_VALUE_APPROVE)
  async approveTechAdoption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApproveTechAdoptionInputSchema)) input: ApproveTechAdoptionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.approveTechAdoption(id, input, authz, user.id);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.ME_VALUE_APPROVE)
  async returnTechAdoption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReturnTechAdoptionInputSchema)) input: ReturnTechAdoptionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.instrumentsService.returnTechAdoption(id, input, authz, user.id);
  }
}
