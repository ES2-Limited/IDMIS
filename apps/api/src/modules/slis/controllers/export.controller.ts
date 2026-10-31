import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { permissions, CreateExportInputSchema, type CreateExportInput } from '@idmis/contracts';
import { ExportService } from '../services/export.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Can(permissions.SLIS_EXPORT_GENERATE)
  async createExport(
    @Body(new ZodValidationPipe(CreateExportInputSchema)) input: CreateExportInput,
    @CurrentUser() user: RequestUser,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.exportService.createExport(input, user, authz);
  }

  @Get(':id')
  @Can(permissions.SLIS_EXPORT_GENERATE)
  async getExport(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.exportService.getExport(id, user, authz);
  }
}
