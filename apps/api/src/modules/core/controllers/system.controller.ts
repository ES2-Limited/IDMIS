import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  permissions,
  RetentionRunInputSchema,
  type RetentionRunInput,
  type RetentionRunResponse,
} from '@idmis/contracts';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { Can, CurrentUser } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { RetentionService } from '../services/retention.service';

@Controller('system')
export class SystemController {
  constructor(private readonly retentionService: RetentionService) {}

  @Post('retention/run')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.SYSTEM_RETENTION_RUN)
  async runRetention(
    @Body(new ZodValidationPipe(RetentionRunInputSchema)) body: RetentionRunInput,
    @CurrentUser() user: RequestUser,
  ): Promise<RetentionRunResponse> {
    return this.retentionService.triggerRetention(body, user);
  }
}
