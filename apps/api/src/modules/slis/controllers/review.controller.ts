import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import {
  ApproveRecordInputSchema,
  BulkApproveInputSchema,
  ListReviewQueueQuerySchema,
  ReturnRecordInputSchema,
  SubmitForReviewInputSchema,
  permissions,
  type ApproveRecordInput,
  type BulkApproveInput,
  type ListReviewQueueQuery,
  type ReturnRecordInput,
  type SubmitForReviewInput,
} from '@idmis/contracts';
import { ReviewService } from '../services/review.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('queue')
  @Can(permissions.SLIS_REVIEW_APPROVE)
  async listQueue(
    @Query(new ZodValidationPipe(ListReviewQueueQuerySchema)) query: ListReviewQueueQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.reviewService.listQueue(query, authz);
  }

  @Post('submit/:entity')
  @Can(permissions.SLIS_REVIEW_SUBMIT)
  async submitForReview(
    @Param('entity') entity: string,
    @Body(new ZodValidationPipe(SubmitForReviewInputSchema)) input: SubmitForReviewInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewService.submitRecords(entity, input, authz, user.id);
  }

  @Post(':entity/:id/approve')
  @Can(permissions.SLIS_REVIEW_APPROVE)
  async approveRecord(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApproveRecordInputSchema)) input: ApproveRecordInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : undefined;
    return this.reviewService.approveRecord(entity, id, version, input, authz, user.id);
  }

  @Post(':entity/:id/return')
  @Can(permissions.SLIS_REVIEW_APPROVE)
  async returnRecord(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReturnRecordInputSchema)) input: ReturnRecordInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : undefined;
    return this.reviewService.returnRecord(entity, id, version, input, authz, user.id);
  }

  @Post('bulk-approve')
  @Can(permissions.SLIS_REVIEW_APPROVE)
  async bulkApprove(
    @Body(new ZodValidationPipe(BulkApproveInputSchema)) input: BulkApproveInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewService.bulkApprove(input, authz, user.id);
  }
}
