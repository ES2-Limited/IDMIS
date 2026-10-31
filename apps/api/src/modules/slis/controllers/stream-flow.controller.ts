import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ListStreamFlowReadingsQuerySchema,
  RecordStreamFlowInputSchema,
  permissions,
  type ListStreamFlowReadingsQuery,
  type RecordStreamFlowInput,
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
}
