import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import {
  permissions,
  CreateSurveyInputSchema,
  UpdateSurveyInputSchema,
  ListSurveysQuerySchema,
  CreateSurveyQuestionInputSchema,
  UpdateSurveyQuestionInputSchema,
  CreateSurveyResponseInputSchema,
  ListSurveyResponsesQuerySchema,
} from '@idmis/contracts';
import type {
  CreateSurveyInput,
  UpdateSurveyInput,
  ListSurveysQuery,
  CreateSurveyQuestionInput,
  UpdateSurveyQuestionInput,
  CreateSurveyResponseInput,
  ListSurveyResponsesQuery,
} from '@idmis/contracts';
import { Can, CurrentAuthz, CurrentUser } from '../../../platform/auth';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { SurveyService } from '../services/survey.service';

@Controller('me/surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get()
  @Can(permissions.ME_SURVEY_RESPOND)
  async listSurveys(
    @Query(new ZodValidationPipe(ListSurveysQuerySchema)) query: ListSurveysQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.surveyService.listSurveys(query, authz);
  }

  @Post()
  @Can(permissions.ME_SURVEY_MANAGE)
  async createSurvey(
    @Body(new ZodValidationPipe(CreateSurveyInputSchema)) input: CreateSurveyInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.createSurvey(input, authz, user.id);
  }

  @Get('responses/:responseId')
  @Can(permissions.ME_SURVEY_MANAGE)
  async getResponse(@Param('responseId') responseId: string, @CurrentAuthz() authz: UserAuthz) {
    return this.surveyService.getResponse(responseId, authz);
  }

  @Delete('responses/:responseId')
  @Can(permissions.ME_SURVEY_MANAGE)
  async deleteResponse(
    @Param('responseId') responseId: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.softDeleteResponse(responseId, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.ME_SURVEY_RESPOND)
  async getSurvey(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.surveyService.getSurvey(id, authz);
  }

  @Put(':id')
  @Can(permissions.ME_SURVEY_MANAGE)
  async updateSurvey(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSurveyInputSchema)) input: UpdateSurveyInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.updateSurvey(id, input, authz, user.id);
  }

  @Post(':id/version')
  @Can(permissions.ME_SURVEY_MANAGE)
  async createNewVersion(
    @Param('id') id: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.createNewVersion(id, authz, user.id);
  }

  @Post(':id/questions')
  @Can(permissions.ME_SURVEY_MANAGE)
  async addQuestion(
    @Param('id') surveyId: string,
    @Body(new ZodValidationPipe(CreateSurveyQuestionInputSchema)) input: CreateSurveyQuestionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.addQuestion(surveyId, input, authz, user.id);
  }

  @Put(':id/questions/:questionId')
  @Can(permissions.ME_SURVEY_MANAGE)
  async updateQuestion(
    @Param('id') surveyId: string,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(UpdateSurveyQuestionInputSchema)) input: UpdateSurveyQuestionInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.updateQuestion(surveyId, questionId, input, authz, user.id);
  }

  @Delete(':id/questions/:questionId')
  @Can(permissions.ME_SURVEY_MANAGE)
  async deleteQuestion(
    @Param('id') surveyId: string,
    @Param('questionId') questionId: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.deleteQuestion(surveyId, questionId, authz, user.id);
  }

  @Post(':id/responses')
  @Can(permissions.ME_SURVEY_RESPOND)
  async createResponse(
    @Param('id') surveyId: string,
    @Body(new ZodValidationPipe(CreateSurveyResponseInputSchema)) input: CreateSurveyResponseInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.surveyService.createResponse({ ...input, surveyId }, authz, user.id);
  }

  @Get(':id/responses')
  @Can(permissions.ME_SURVEY_MANAGE)
  async listResponses(
    @Param('id') surveyId: string,
    @Query(new ZodValidationPipe(ListSurveyResponsesQuerySchema)) query: ListSurveyResponsesQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.surveyService.listResponses({ ...query, surveyId }, authz);
  }
}
