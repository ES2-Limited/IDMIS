import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateReportInputSchema,
  ListReportsQuerySchema,
  permissions,
  type CreateReportInput,
  type CreateReportResponse,
  type ReportResponse,
  type ListReportsQuery,
  type ListReportsResponse,
} from '@idmis/contracts';
import { ReportService } from '../services/report.service';
import { Can, CurrentUser, CurrentAuthz, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @Can(permissions.REPORT_GENERATE)
  @HttpCode(HttpStatus.ACCEPTED)
  async createReport(
    @Body(new ZodValidationPipe(CreateReportInputSchema)) input: CreateReportInput,
    @CurrentUser() user: RequestUser,
    @CurrentAuthz() authz: UserAuthz,
  ): Promise<CreateReportResponse> {
    return this.reportService.createReport(input, user, authz);
  }

  @Get()
  @Can(permissions.REPORT_GENERATE)
  async listReports(
    @Query(new ZodValidationPipe(ListReportsQuerySchema)) query: ListReportsQuery,
    @CurrentUser() user: RequestUser,
    @CurrentAuthz() authz: UserAuthz,
  ): Promise<ListReportsResponse> {
    return this.reportService.listReports(query, user, authz);
  }

  @Get(':id')
  @Can(permissions.REPORT_GENERATE)
  async getReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReportResponse> {
    return this.reportService.getReport(id, user);
  }
}
