import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CheckFarmerDuplicatesInputSchema,
  CreateFarmerIdentityInputSchema,
  CreateFarmerInputSchema,
  ListFarmersQuerySchema,
  UpdateFarmerInputSchema,
  permissions,
  type CheckFarmerDuplicatesInput,
  type CreateFarmerIdentityInput,
  type CreateFarmerInput,
  type ListFarmersQuery,
  type UpdateFarmerInput,
} from '@idmis/contracts';
import { FarmerService } from '../services/farmer.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/farmers')
export class FarmerController {
  constructor(private readonly farmerService: FarmerService) {}

  @Get()
  @Can(permissions.SLIS_FARMER_READ)
  async listFarmers(
    @Query(new ZodValidationPipe(ListFarmersQuerySchema)) query: ListFarmersQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.farmerService.listFarmers(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_FARMER_CREATE)
  async createFarmer(
    @Body(new ZodValidationPipe(CreateFarmerInputSchema)) input: CreateFarmerInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmerService.createFarmer(input, authz, user.id);
  }

  @Post('check-duplicate')
  @Can(permissions.SLIS_FARMER_READ)
  async checkDuplicates(
    @Body(new ZodValidationPipe(CheckFarmerDuplicatesInputSchema))
    input: CheckFarmerDuplicatesInput,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.farmerService.checkDuplicates(input, authz);
  }

  @Get(':id')
  @Can(permissions.SLIS_FARMER_READ)
  async getFarmer(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.farmerService.getFarmer(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_FARMER_UPDATE)
  async updateFarmer(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFarmerInputSchema)) input: UpdateFarmerInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.farmerService.updateFarmer(id, version, input, authz, user.id);
  }

  @Get(':id/identities')
  @Can(permissions.SLIS_FARMER_READ)
  async getIdentities(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.farmerService.getIdentities(id, authz);
  }

  @Post(':id/identities')
  @Can(permissions.SLIS_FARMER_UPDATE)
  async addIdentity(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateFarmerIdentityInputSchema.omit({ farmerId: true })))
    input: Omit<CreateFarmerIdentityInput, 'farmerId'>,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmerService.addIdentity(id, { ...input, farmerId: id }, authz, user.id);
  }

  @Delete(':id/identities/:identityId')
  @Can(permissions.SLIS_FARMER_UPDATE)
  async deleteIdentity(
    @Param('id') id: string,
    @Param('identityId') identityId: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmerService.deleteIdentity(id, identityId, authz, user.id);
  }
}
