import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ListStreamFlowReadingsQuerySchema,
  RecordStreamFlowInputSchema,
  UpdateStreamFlowInputSchema,
  permissions,
  type ListStreamFlowReadingsQuery,
  type RecordStreamFlowInput,
  type UpdateStreamFlowInput,
} from '@idmis/contracts';
import { StreamFlowService } from '../services/stream-flow.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/stream-flows')
export class StreamFlowController {
  constructor(private readonly streamFlowService: StreamFlowService) {}

  @Get()
  @Can(permissions.SLIS_STREAM_FLOW_RECORD)
  async listStreamFlows(
    @Query(new ZodValidationPipe(ListStreamFlowReadingsQuerySchema))
    query: ListStreamFlowReadingsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.streamFlowService.listStreamFlows(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_STREAM_FLOW_RECORD)
  async recordStreamFlow(
    @Body(new ZodValidationPipe(RecordStreamFlowInputSchema)) input: RecordStreamFlowInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.streamFlowService.recordStreamFlow(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_STREAM_FLOW_RECORD)
  async getStreamFlow(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.streamFlowService.getStreamFlow(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_STREAM_FLOW_RECORD)
  async updateStreamFlow(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStreamFlowInputSchema)) input: UpdateStreamFlowInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.streamFlowService.updateStreamFlow(id, version, input, authz, user.id);
  }
}
