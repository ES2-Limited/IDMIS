import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  permissions,
  CreateFeeBillingInputSchema,
  UpdateFeeBillingInputSchema,
  ListFeeBillingsQuerySchema,
  CreateFeeCollectionInputSchema,
  UpdateFeeCollectionInputSchema,
  ListFeeCollectionsQuerySchema,
  type CreateFeeBillingInput,
  type UpdateFeeBillingInput,
  type ListFeeBillingsQuery,
  type CreateFeeCollectionInput,
  type UpdateFeeCollectionInput,
  type ListFeeCollectionsQuery,
} from '@idmis/contracts';
import { FeeService } from '../services/fee.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/fees')
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  // --- Fee Billings ---

  @Get('billings')
  @Can(permissions.SLIS_FEE_READ)
  async listBillings(
    @Query(new ZodValidationPipe(ListFeeBillingsQuerySchema)) query: ListFeeBillingsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.feeService.listBillings(query, authz);
  }

  @Post('billings')
  @Can(permissions.SLIS_FEE_RECORD)
  @HttpCode(HttpStatus.CREATED)
  async createBilling(
    @Body(new ZodValidationPipe(CreateFeeBillingInputSchema)) input: CreateFeeBillingInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.feeService.createBilling(input, authz, user.id);
  }

  @Get('billings/:id')
  @Can(permissions.SLIS_FEE_READ)
  async getBilling(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.feeService.getBilling(id, authz);
  }

  @Patch('billings/:id')
  @Can(permissions.SLIS_FEE_RECORD)
  async updateBilling(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFeeBillingInputSchema)) input: UpdateFeeBillingInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.feeService.updateBilling(id, version, input, authz, user.id);
  }

  // --- Fee Collections ---

  @Get('collections')
  @Can(permissions.SLIS_FEE_READ)
  async listCollections(
    @Query(new ZodValidationPipe(ListFeeCollectionsQuerySchema)) query: ListFeeCollectionsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.feeService.listCollections(query, authz);
  }

  @Post('collections')
  @Can(permissions.SLIS_FEE_RECORD)
  @HttpCode(HttpStatus.CREATED)
  async createCollection(
    @Body(new ZodValidationPipe(CreateFeeCollectionInputSchema)) input: CreateFeeCollectionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.feeService.createCollection(input, authz, user.id);
  }

  @Get('collections/:id')
  @Can(permissions.SLIS_FEE_READ)
  async getCollection(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.feeService.getCollection(id, authz);
  }

  @Patch('collections/:id')
  @Can(permissions.SLIS_FEE_RECORD)
  async updateCollection(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFeeCollectionInputSchema)) input: UpdateFeeCollectionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.feeService.updateCollection(id, version, input, authz, user.id);
  }
}
