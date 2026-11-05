import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  permissions,
  CreateDamSafetyInspectionInputSchema,
  UpdateDamSafetyInspectionInputSchema,
  ReturnDamInspectionInputSchema,
  ListDamInspectionsQuerySchema,
  type CreateDamSafetyInspectionInput,
  type UpdateDamSafetyInspectionInput,
  type ReturnDamInspectionInput,
  type ListDamInspectionsQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { DamInspectionService } from '../services/dam-inspection.service';

@Controller('blis/dam-inspections')
export class DamInspectionController {
  constructor(private readonly inspectionService: DamInspectionService) {}

  @Get()
  @Can(permissions.BLIS_INSPECTION_RECORD)
  async listInspections(
    @Query(new ZodValidationPipe(ListDamInspectionsQuerySchema))
    query: ListDamInspectionsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.inspectionService.list(query, authz);
  }

  @Post()
  @Can(permissions.BLIS_INSPECTION_RECORD)
  async createInspection(
    @Body(new ZodValidationPipe(CreateDamSafetyInspectionInputSchema))
    input: CreateDamSafetyInspectionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inspectionService.create(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.BLIS_INSPECTION_RECORD)
  async getInspection(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.inspectionService.findById(id, authz);
  }

  @Patch(':id')
  @Can(permissions.BLIS_INSPECTION_RECORD)
  async updateInspection(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDamSafetyInspectionInputSchema))
    input: UpdateDamSafetyInspectionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inspectionService.update(id, input.version, input, authz, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.BLIS_INSPECTION_RECORD)
  async submitInspection(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const v = Number.parseInt(version, 10);
    return this.inspectionService.submit(id, Number.isNaN(v) ? 1 : v, authz, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.BLIS_INSPECTION_APPROVE)
  async approveInspection(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const v = Number.parseInt(version, 10);
    return this.inspectionService.approve(id, Number.isNaN(v) ? 1 : v, authz, user.id);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.BLIS_INSPECTION_APPROVE)
  async returnInspection(
    @Param('id') id: string,
    @Query('version') version: string,
    @Body(new ZodValidationPipe(ReturnDamInspectionInputSchema))
    input: ReturnDamInspectionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const v = Number.parseInt(version, 10);
    return this.inspectionService.returnInspection(
      id,
      Number.isNaN(v) ? 1 : v,
      input,
      authz,
      user.id,
    );
  }
}
