import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  permissions,
  CreateIndicatorValueInputSchema,
  UpdateIndicatorValueInputSchema,
  SubmitIndicatorValueInputSchema,
  ApproveIndicatorValueInputSchema,
  ReturnIndicatorValueInputSchema,
  AttachEvidenceInputSchema,
  ListIndicatorValuesQuerySchema,
  type CreateIndicatorValueInput,
  type UpdateIndicatorValueInput,
  type SubmitIndicatorValueInput,
  type ApproveIndicatorValueInput,
  type ReturnIndicatorValueInput,
  type AttachEvidenceInput,
  type ListIndicatorValuesQuery,
} from '@idmis/contracts';
import { IndicatorValueService } from '../services/indicator-value.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('me/values')
export class IndicatorValueController {
  constructor(private readonly valueService: IndicatorValueService) {}

  @Get()
  @Can(permissions.ME_INDICATOR_READ)
  async listValues(
    @Query(new ZodValidationPipe(ListIndicatorValuesQuerySchema)) query: ListIndicatorValuesQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.valueService.listValues(query, authz);
  }

  @Get(':id')
  @Can(permissions.ME_INDICATOR_READ)
  async getValue(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.valueService.getValue(id, authz);
  }

  @Post()
  @Can(permissions.ME_VALUE_SUBMIT)
  async createValue(
    @Body(new ZodValidationPipe(CreateIndicatorValueInputSchema)) input: CreateIndicatorValueInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.createValue(input, authz, user.id);
  }

  @Put(':id')
  @Can(permissions.ME_VALUE_SUBMIT)
  async updateValue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateIndicatorValueInputSchema)) input: UpdateIndicatorValueInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.updateValue(id, input, authz, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.ME_VALUE_SUBMIT)
  async submitValue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitIndicatorValueInputSchema)) input: SubmitIndicatorValueInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.submitValue(id, input, authz, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.ME_VALUE_APPROVE)
  async approveValue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApproveIndicatorValueInputSchema))
    input: ApproveIndicatorValueInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.approveValue(id, input, authz, user.id);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.ME_VALUE_APPROVE)
  async returnValue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReturnIndicatorValueInputSchema)) input: ReturnIndicatorValueInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.returnValue(id, input, authz, user.id);
  }

  @Post(':id/evidence')
  @Can(permissions.ME_VALUE_SUBMIT)
  async attachEvidence(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AttachEvidenceInputSchema)) input: AttachEvidenceInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.attachEvidence(id, input, authz, user.id);
  }

  @Get(':id/evidence')
  @Can(permissions.ME_INDICATOR_READ)
  async listEvidence(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.valueService.listEvidence(id, authz);
  }

  @Delete(':id/evidence/:fileId')
  @Can(permissions.ME_VALUE_SUBMIT)
  async removeEvidence(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.valueService.removeEvidence(id, fileId, authz, user.id);
  }
}
