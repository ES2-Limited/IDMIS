import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { permissions, isLocationInNigeria } from '@idmis/contracts';
import type {
  CreateSurveyInput,
  UpdateSurveyInput,
  ListSurveysQuery,
  CreateSurveyQuestionInput,
  UpdateSurveyQuestionInput,
  CreateSurveyResponseInput,
  ListSurveyResponsesQuery,
} from '@idmis/contracts';
import type { UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import { eventBus } from '../../../platform/events/event-bus';
import { assertMeScope } from '../utils/assert-me-scope';
import { SurveyRepository } from '../repositories/survey.repository';
import { SurveyResponseRepository } from '../repositories/survey-response.repository';

export interface AnswerValidationQuestion {
  id: string;
  code: string;
  text: string;
  answerType: string;
  options?: unknown;
  isRequired: boolean;
}

@Injectable()
export class SurveyService {
  constructor(
    private readonly surveyRepo: SurveyRepository,
    private readonly responseRepo: SurveyResponseRepository,
  ) {}

  async listSurveys(query: ListSurveysQuery, authz: UserAuthz) {
    const canManage = authz.can(permissions.ME_SURVEY_MANAGE);
    const canRespond = authz.can(permissions.ME_SURVEY_RESPOND);
    if (!canManage && !canRespond) {
      throw new ForbiddenException('Missing survey permissions');
    }

    const scope = canManage
      ? authz.scopeFor(permissions.ME_SURVEY_MANAGE)
      : authz.scopeFor(permissions.ME_SURVEY_RESPOND);

    return this.surveyRepo.listSurveys(query, scope);
  }

  async getSurvey(id: string, authz: UserAuthz) {
    const canManage = authz.can(permissions.ME_SURVEY_MANAGE);
    const canRespond = authz.can(permissions.ME_SURVEY_RESPOND);
    if (!canManage && !canRespond) {
      throw new NotFoundException('Survey not found');
    }

    const scope = canManage
      ? authz.scopeFor(permissions.ME_SURVEY_MANAGE)
      : authz.scopeFor(permissions.ME_SURVEY_RESPOND);

    const survey = await this.surveyRepo.findById(id, scope);
    if (!survey) {
      throw new NotFoundException(`Survey with ID '${id}' not found`);
    }

    const questions = await this.surveyRepo.findQuestionsBySurveyId(id);
    return {
      ...survey,
      questions,
    };
  }

  async createSurvey(input: CreateSurveyInput, authz: UserAuthz, actorUserId: string) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new ForbiddenException('Missing required permission: me.survey.manage');
    }

    if (input.schemeId) {
      await assertMeScope(authz, permissions.ME_SURVEY_MANAGE, {
        scopeType: 'scheme',
        scopeOrgId: input.schemeId,
      });
    } else {
      await assertMeScope(authz, permissions.ME_SURVEY_MANAGE, {
        scopeType: 'national',
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.surveyRepo.create(
          {
            name: input.name,
            schemeId: input.schemeId ?? null,
            opensOn: input.opensOn ?? null,
            closesOn: input.closesOn ?? null,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'me.survey',
          actorUserId,
        },
      },
    );
  }

  async updateSurvey(id: string, input: UpdateSurveyInput, authz: UserAuthz, actorUserId: string) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new NotFoundException('Survey not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const existing = await this.surveyRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Survey with ID '${id}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        return this.surveyRepo.update(
          id,
          input.version,
          {
            name: input.name,
            schemeId: input.schemeId,
            opensOn: input.opensOn,
            closesOn: input.closesOn,
            updatedBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'me.survey',
          entityId: id,
          actorUserId,
          before: existing,
        },
      },
    );
  }

  async createNewVersion(id: string, authz: UserAuthz, actorUserId: string) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new NotFoundException('Survey not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const existing = await this.surveyRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException(`Survey with ID '${id}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        const cloned = await this.surveyRepo.createNewVersion(id, actorUserId, tx);
        if (!cloned) {
          throw new NotFoundException(`Survey with ID '${id}' not found`);
        }
        return cloned;
      },
      {
        audit: {
          action: 'create',
          entity: 'me.survey',
          actorUserId,
        },
      },
    );
  }

  async addQuestion(
    surveyId: string,
    input: CreateSurveyQuestionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new NotFoundException('Survey not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const survey = await this.surveyRepo.findById(surveyId, scope);
    if (!survey) {
      throw new NotFoundException(`Survey with ID '${surveyId}' not found`);
    }

    // Question freeze check
    const hasResp = await this.surveyRepo.hasResponses(surveyId);
    if (hasResp) {
      throw new ConflictProblemException({
        detail:
          'Cannot add or modify questions on a survey that already has responses. Create a new survey version.',
        current: survey,
        currentVersion: survey.version,
      });
    }

    const existingQ = await this.surveyRepo.findQuestionByCode(surveyId, input.code);
    if (existingQ) {
      throw new ConflictProblemException({
        detail: `Question with code '${input.code}' already exists in this survey`,
        current: existingQ,
        currentVersion: 1,
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.surveyRepo.createQuestion(
          {
            surveyId,
            code: input.code,
            text: input.text,
            answerType: input.answerType,
            options: input.options ?? null,
            sortOrder: input.sortOrder,
            isRequired: input.isRequired,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'me.survey_question',
          actorUserId,
        },
      },
    );
  }

  async updateQuestion(
    surveyId: string,
    questionId: string,
    input: UpdateSurveyQuestionInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new NotFoundException('Survey not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const survey = await this.surveyRepo.findById(surveyId, scope);
    if (!survey) {
      throw new NotFoundException(`Survey with ID '${surveyId}' not found`);
    }

    // Question freeze check
    const hasResp = await this.surveyRepo.hasResponses(surveyId);
    if (hasResp) {
      throw new ConflictProblemException({
        detail:
          'Cannot modify questions on a survey that already has responses. Create a new survey version.',
        current: survey,
        currentVersion: survey.version,
      });
    }

    const question = await this.surveyRepo.findQuestionById(questionId);
    if (!question || question.surveyId !== surveyId) {
      throw new NotFoundException(`Question with ID '${questionId}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        return this.surveyRepo.updateQuestion(questionId, input, tx);
      },
      {
        audit: {
          action: 'update',
          entity: 'me.survey_question',
          entityId: questionId,
          actorUserId,
          before: question,
        },
      },
    );
  }

  async deleteQuestion(
    surveyId: string,
    questionId: string,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    if (!authz.can(permissions.ME_SURVEY_MANAGE)) {
      throw new NotFoundException('Survey not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const survey = await this.surveyRepo.findById(surveyId, scope);
    if (!survey) {
      throw new NotFoundException(`Survey with ID '${surveyId}' not found`);
    }

    // Question freeze check
    const hasResp = await this.surveyRepo.hasResponses(surveyId);
    if (hasResp) {
      throw new ConflictProblemException({
        detail:
          'Cannot delete questions on a survey that already has responses. Create a new survey version.',
        current: survey,
        currentVersion: survey.version,
      });
    }

    const question = await this.surveyRepo.findQuestionById(questionId);
    if (!question || question.surveyId !== surveyId) {
      throw new NotFoundException(`Question with ID '${questionId}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        return this.surveyRepo.deleteQuestion(questionId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.survey_question',
          entityId: questionId,
          actorUserId,
          before: question,
        },
      },
    );
  }

  /**
   * Validates a typed survey answer against its question definition.
   */
  validateAnswer(question: AnswerValidationQuestion, value: unknown): void {
    const isMissing =
      value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

    if (question.isRequired && isMissing) {
      throw new BadRequestException(
        `Answer for question '${question.code}' is required but was not provided`,
      );
    }

    if (isMissing) {
      return;
    }

    switch (question.answerType) {
      case 'text': {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Answer for question '${question.code}' must be a text string`,
          );
        }
        break;
      }

      case 'number': {
        const num =
          typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim().length > 0
              ? Number(value)
              : NaN;
        if (isNaN(num)) {
          throw new BadRequestException(
            `Answer for question '${question.code}' must be a valid number`,
          );
        }
        break;
      }

      case 'single': {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Answer for question '${question.code}' must be a single string option`,
          );
        }
        const choices = this.extractChoices(question.options);
        if (choices.length > 0 && !choices.includes(value.trim())) {
          throw new BadRequestException(
            `Answer '${value}' for question '${question.code}' is not a valid choice. Allowed: ${choices.join(', ')}`,
          );
        }
        break;
      }

      case 'multi': {
        let arr: unknown[];
        if (Array.isArray(value)) {
          arr = value;
        } else if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              arr = parsed;
            } else {
              arr = [value];
            }
          } catch {
            arr = value.split(',').map((s) => s.trim());
          }
        } else {
          throw new BadRequestException(
            `Answer for question '${question.code}' must be an array of selected options`,
          );
        }

        const choices = this.extractChoices(question.options);
        if (choices.length > 0) {
          for (const item of arr) {
            if (typeof item !== 'string' || !choices.includes(item.trim())) {
              throw new BadRequestException(
                `Choice '${item}' for question '${question.code}' is invalid. Allowed: ${choices.join(', ')}`,
              );
            }
          }
        }
        break;
      }

      case 'date': {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
          throw new BadRequestException(
            `Answer for question '${question.code}' must be a valid date string (YYYY-MM-DD)`,
          );
        }
        const parsedDate = new Date(value.trim());
        if (isNaN(parsedDate.getTime())) {
          throw new BadRequestException(
            `Answer for question '${question.code}' is an invalid calendar date`,
          );
        }
        break;
      }

      case 'gps': {
        const { lat, lon } = this.extractCoordinates(value, question.code);
        if (!isLocationInNigeria(lat, lon)) {
          throw new BadRequestException(
            `GPS location for question '${question.code}' (${lat}, ${lon}) must be within Nigeria`,
          );
        }
        break;
      }

      default:
        throw new BadRequestException(`Unknown answer type '${question.answerType}'`);
    }
  }

  private extractChoices(options: unknown): string[] {
    if (!options) return [];
    if (Array.isArray(options)) return options.map(String);
    if (typeof options === 'object') {
      const rec = options as Record<string, unknown>;
      if (Array.isArray(rec.choices)) return rec.choices.map(String);
      if (Array.isArray(rec.options)) return rec.options.map(String);
    }
    return [];
  }

  private extractCoordinates(value: unknown, code: string): { lat: number; lon: number } {
    let lat: number = NaN;
    let lon: number = NaN;

    if (Array.isArray(value) && value.length >= 2) {
      lon = Number(value[0]);
      lat = Number(value[1]);
    } else if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (obj.type === 'Point' && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
        lon = Number(obj.coordinates[0]);
        lat = Number(obj.coordinates[1]);
      } else {
        lat = Number(obj.lat ?? obj.latitude);
        lon = Number(obj.lng ?? obj.lon ?? obj.longitude);
      }
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.extractCoordinates(parsed, code);
      } catch {
        const parts = value.split(',').map((s) => s.trim());
        if (parts.length >= 2) {
          lat = Number(parts[0]);
          lon = Number(parts[1]);
        }
      }
    }

    if (isNaN(lat) || isNaN(lon)) {
      throw new BadRequestException(
        `Answer for question '${code}' must be a valid GPS coordinate object or string`,
      );
    }

    return { lat, lon };
  }

  async createResponse(
    input: CreateSurveyResponseInput,
    authz: UserAuthz,
    actorUserId: string,
    deviceId?: string | null,
    importBatchId?: string | null,
  ) {
    if (!authz.can(permissions.ME_SURVEY_RESPOND)) {
      throw new ForbiddenException('Missing required permission: me.survey.respond');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_RESPOND);

    // Scoped (non-national) users MUST give a schemeId for a response; only national users may create scheme-less ones.
    if (!scope.isNational && !input.schemeId) {
      throw new BadRequestException('schemeId is required for survey responses by scoped users');
    }

    const survey = await this.surveyRepo.findById(input.surveyId);
    if (!survey) {
      throw new NotFoundException(`Survey with ID '${input.surveyId}' not found`);
    }

    // If the survey has a scheme_id, the response's scheme must equal it (400 otherwise).
    if (survey.schemeId && input.schemeId !== survey.schemeId) {
      throw new BadRequestException(
        `Survey belongs to scheme '${survey.schemeId}', response scheme must match`,
      );
    }

    // Shared scope assertion (scheme -> server-derived state, scheme OR state scope)
    if (input.schemeId) {
      await assertMeScope(authz, permissions.ME_SURVEY_RESPOND, {
        scopeType: 'scheme',
        scopeOrgId: input.schemeId,
      });
    } else {
      await assertMeScope(authz, permissions.ME_SURVEY_RESPOND, {
        scopeType: 'national',
      });
    }

    const questions = await this.surveyRepo.findQuestionsBySurveyId(input.surveyId);
    const questionsByCode = new Map(questions.map((q) => [q.code, q]));
    const questionsById = new Map(questions.map((q) => [q.id, q]));

    // Match each answer to its question and validate
    const validatedAnswers: Array<{ questionId: string; value: unknown }> = [];
    const answeredQuestionIds = new Set<string>();

    for (const ans of input.answers) {
      let q: AnswerValidationQuestion | undefined;
      if (ans.questionId) {
        q = questionsById.get(ans.questionId);
      } else if (ans.questionCode) {
        q = questionsByCode.get(ans.questionCode);
      }

      if (!q) {
        throw new BadRequestException(
          `Referenced question ID '${ans.questionId || ans.questionCode}' does not belong to survey '${input.surveyId}'`,
        );
      }

      this.validateAnswer(q, ans.value);
      validatedAnswers.push({ questionId: q.id, value: ans.value });
      answeredQuestionIds.add(q.id);
    }

    // Check all required questions are answered
    for (const q of questions) {
      if (q.isRequired && !answeredQuestionIds.has(q.id)) {
        throw new BadRequestException(`Required question '${q.code}' (${q.text}) was not answered`);
      }
    }

    // Format location if provided
    let locationVal: unknown = null;
    if (input.location) {
      const { lat, lon } = this.extractCoordinates(input.location, 'location');
      if (!isLocationInNigeria(lat, lon)) {
        throw new BadRequestException(
          `Survey response location (${lat}, ${lon}) must be within Nigeria`,
        );
      }
      locationVal = `SRID=4326;POINT(${lon} ${lat})`;
    }

    const result = await runInTransaction(
      async (tx) => {
        const responseId = input.id ?? crypto.randomUUID();
        const createdResponse = await this.responseRepo.create(
          {
            id: responseId,
            surveyId: input.surveyId,
            schemeId: input.schemeId ?? null,
            farmerId: input.farmerId ?? null,
            householdId: input.householdId ?? null,
            collectedAt: input.collectedAt ?? new Date().toISOString(),
            location: locationVal,
            status: 'submitted',
            submittedBy: actorUserId,
            submittedAt: new Date().toISOString(),
            deviceId: deviceId ?? null,
            importBatchId: importBatchId ?? null,
            createdBy: actorUserId,
          },
          tx,
        );

        const createdAnswers = [];
        for (const ans of validatedAnswers) {
          const a = await this.responseRepo.createAnswer(
            {
              responseId,
              questionId: ans.questionId,
              value: ans.value,
            },
            tx,
          );
          createdAnswers.push(a);
        }

        return {
          ...createdResponse,
          answers: createdAnswers,
        };
      },
      {
        audit: {
          action: 'create',
          entity: 'me.survey_response',
          actorUserId,
        },
      },
    );

    eventBus.emitRecompute({ schemeId: input.schemeId ?? null });
    return result;
  }

  async getResponse(id: string, authz: UserAuthz) {
    const canManage = authz.can(permissions.ME_SURVEY_MANAGE);
    const canRespond = authz.can(permissions.ME_SURVEY_RESPOND);
    if (!canManage && !canRespond) {
      throw new NotFoundException('Survey response not found');
    }

    const scope = canManage
      ? authz.scopeFor(permissions.ME_SURVEY_MANAGE)
      : authz.scopeFor(permissions.ME_SURVEY_RESPOND);

    const response = await this.responseRepo.findById(id, scope);
    if (!response) {
      throw new NotFoundException(`Survey response with ID '${id}' not found`);
    }

    const answers = await this.responseRepo.findAnswersByResponseId(id);
    return {
      ...response,
      answers,
    };
  }

  async listResponses(query: ListSurveyResponsesQuery, authz: UserAuthz) {
    const canManage = authz.can(permissions.ME_SURVEY_MANAGE);
    const canRespond = authz.can(permissions.ME_SURVEY_RESPOND);
    if (!canManage && !canRespond) {
      throw new ForbiddenException('Missing survey permissions');
    }

    const scope = canManage
      ? authz.scopeFor(permissions.ME_SURVEY_MANAGE)
      : authz.scopeFor(permissions.ME_SURVEY_RESPOND);

    return this.responseRepo.listResponses(query, scope);
  }

  async softDeleteResponse(id: string, authz: UserAuthz, actorUserId: string) {
    const canManage = authz.can(permissions.ME_SURVEY_MANAGE);
    if (!canManage) {
      throw new NotFoundException('Survey response not found');
    }

    const scope = authz.scopeFor(permissions.ME_SURVEY_MANAGE);
    const response = await this.responseRepo.findById(id, scope);
    if (!response) {
      throw new NotFoundException(`Survey response with ID '${id}' not found`);
    }

    return runInTransaction(
      async (tx) => {
        return this.responseRepo.softDeleteResponse(id, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'me.survey_response',
          entityId: id,
          actorUserId,
          before: response,
        },
      },
    );
  }
}
