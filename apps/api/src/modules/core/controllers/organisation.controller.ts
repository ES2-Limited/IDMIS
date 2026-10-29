import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateOrganisationInputSchema,
  ListOrganisationsQuerySchema,
  UpdateOrganisationInputSchema,
  permissions,
  type CreateOrganisationInput,
  type ListOrganisationsQuery,
  type UpdateOrganisationInput,
} from '@idmis/contracts';
import { OrganisationService } from '../services/organisation.service';
import { Can, CurrentUser } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('admin/organisations')
export class OrganisationController {
  constructor(private readonly orgService: OrganisationService) {}

  @Get()
  @Can(permissions.CORE_ORGANISATION_READ)
  async listOrganisations(
    @Query(new ZodValidationPipe(ListOrganisationsQuerySchema)) query: ListOrganisationsQuery,
  ) {
    return this.orgService.listOrganisations(query);
  }

  @Post()
  @Can(permissions.CORE_ORGANISATION_MANAGE)
  async createOrganisation(
    @Body(new ZodValidationPipe(CreateOrganisationInputSchema)) input: CreateOrganisationInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orgService.createOrganisation(input, user.id);
  }

  @Get(':id')
  @Can(permissions.CORE_ORGANISATION_READ)
  async getOrganisation(@Param('id') id: string) {
    return this.orgService.getOrganisation(id);
  }

  @Patch(':id')
  @Can(permissions.CORE_ORGANISATION_MANAGE)
  async updateOrganisation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOrganisationInputSchema)) input: UpdateOrganisationInput,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.orgService.updateOrganisation(id, version, input, user.id);
  }
}
