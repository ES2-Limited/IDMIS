import { Injectable, Logger } from '@nestjs/common';
import {
  permissions,
  ME_IMPORT_TEMPLATES,
  SurveyResponseImportRowSchema,
  type Permission,
  type RequestScope,
  type ImportColumnDefinition,
} from '@idmis/contracts';
import {
  survey,
  surveyQuestion,
  surveyResponse,
  organisation,
  organisationState,
  eq,
  and,
  isNull,
  desc,
} from '@idmis/db';
import type { UserAuthz } from '../../../platform/auth';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type {
  ImportDatasetHandler,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { SurveyService } from '../services/survey.service';

@Injectable()
export class SurveyResponseImportHandler implements ImportDatasetHandler {
  readonly dataset = 'me.survey_response';
  readonly version = 1;
  readonly permission: Permission = permissions.ME_SURVEY_RESPOND;
  readonly columns: ImportColumnDefinition[] = ME_IMPORT_TEMPLATES['me.survey_response'];

  private readonly logger = new Logger(SurveyResponseImportHandler.name);

  constructor(private readonly surveyService: SurveyService) {}

  async parseRow(rawRow: Record<string, unknown>): Promise<ParseRowResult> {
    const rawData = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const stringOrUndefined = (val: unknown) => {
      if (val === undefined || val === null) return undefined;
      const s = String(val).trim();
      return s.length > 0 ? s : undefined;
    };

    const rowObj = {
      surveyName: stringOrUndefined(rawRow.surveyName),
      surveyId: stringOrUndefined(rawRow.surveyId),
      schemeCode: stringOrUndefined(rawRow.schemeCode),
      respondentId: stringOrUndefined(rawRow.respondentId),
      respondentPhone: stringOrUndefined(rawRow.respondentPhone),
      period: stringOrUndefined(rawRow.period),
      collectedAt: stringOrUndefined(rawRow.collectedAt),
      answers: stringOrUndefined(rawRow.answers) ?? '',
    };

    const parsed = SurveyResponseImportRowSchema.safeParse(rowObj);
    let parsedData: Record<string, unknown>;

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          column: issue.path.join('.') || 'row',
          message: issue.message,
          code: issue.code,
        });
      }
      parsedData = { ...rowObj };
    } else {
      parsedData = { ...parsed.data };
    }

    // Pre-validate answers JSON format
    if (parsedData.answers) {
      try {
        const parsedAnswers = JSON.parse(String(parsedData.answers));
        if (
          typeof parsedAnswers !== 'object' ||
          parsedAnswers === null ||
          Array.isArray(parsedAnswers)
        ) {
          errors.push({
            column: 'answers',
            message: 'Answers must be a JSON object mapping question codes to values',
            code: 'invalid_json',
          });
        } else {
          parsedData._parsedAnswers = parsedAnswers;
        }
      } catch {
        errors.push({
          column: 'answers',
          message: 'Answers is not valid JSON string',
          code: 'invalid_json',
        });
      }
    }

    return { rawData, parsedData, errors };
  }

  async validateRow(
    row: {
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
    },
    scope: RequestScope,
    tx: TransactionClient,
  ): Promise<Array<{ column: string; message: string; code?: string }>> {
    const errors: Array<{ column: string; message: string; code?: string }> = [];
    const data = row.parsedData;

    // 1. Resolve survey
    let resolvedSurveyId = data.surveyId as string | undefined;
    if (!resolvedSurveyId && data.surveyName) {
      const [found] = await tx
        .select({ id: survey.id, schemeId: survey.schemeId })
        .from(survey)
        .where(and(eq(survey.name, String(data.surveyName)), isNull(survey.deletedAt)))
        .orderBy(desc(survey.version))
        .limit(1);

      if (found) {
        resolvedSurveyId = found.id;
        data.surveyId = found.id;
        if (!data.schemeId && found.schemeId) {
          data.schemeId = found.schemeId;
        }
      } else {
        errors.push({
          column: 'surveyName',
          message: `Referenced survey name '${data.surveyName}' does not exist`,
        });
      }
    } else if (resolvedSurveyId) {
      const [found] = await tx
        .select({ id: survey.id, schemeId: survey.schemeId })
        .from(survey)
        .where(and(eq(survey.id, resolvedSurveyId), isNull(survey.deletedAt)))
        .limit(1);

      if (!found) {
        errors.push({
          column: 'surveyId',
          message: `Referenced survey ID '${resolvedSurveyId}' does not exist`,
        });
      } else if (!data.schemeId && found.schemeId) {
        data.schemeId = found.schemeId;
      }
    } else {
      errors.push({
        column: 'surveyName',
        message: 'Either surveyName or surveyId must be specified',
      });
    }

    // 2. Resolve scheme and check authorization scope
    if (data.schemeCode) {
      const [foundScheme] = await tx
        .select({ id: organisation.id, stateId: organisationState.stateId })
        .from(organisation)
        .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
        .where(
          and(
            eq(organisation.code, String(data.schemeCode)),
            eq(organisation.type, 'scheme'),
            isNull(organisation.deletedAt),
          ),
        )
        .limit(1);

      if (!foundScheme) {
        errors.push({
          column: 'schemeCode',
          message: `Referenced scheme code '${data.schemeCode}' does not exist`,
        });
      } else {
        data.schemeId = foundScheme.id;

        if (!scope.isNational) {
          const schemeMatch = scope.schemeIds?.includes(foundScheme.id);
          const stateMatch = foundScheme.stateId && scope.stateIds?.includes(foundScheme.stateId);
          if (!schemeMatch && !stateMatch) {
            errors.push({
              column: 'schemeCode',
              message: 'Target scheme is outside your assigned scope',
              code: 'out_of_scope',
            });
          }
        }
      }
    } else if (data.schemeId && !scope.isNational) {
      const schemeId = String(data.schemeId);
      const schemeMatch = scope.schemeIds?.includes(schemeId);
      if (!schemeMatch) {
        errors.push({
          column: 'schemeCode',
          message: 'Survey target scheme is outside your assigned scope',
          code: 'out_of_scope',
        });
      }
    }

    // 3. Validate answers against survey questions
    if (resolvedSurveyId && data._parsedAnswers) {
      const answersObj = data._parsedAnswers as Record<string, unknown>;
      const questions = await tx
        .select()
        .from(surveyQuestion)
        .where(eq(surveyQuestion.surveyId, resolvedSurveyId));

      const questionsByCode = new Map(questions.map((q) => [q.code, q]));

      for (const q of questions) {
        const val = answersObj[q.code];
        try {
          this.surveyService.validateAnswer(q, val);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid answer';
          errors.push({
            column: 'answers',
            message: msg,
            code: 'invalid_answer',
          });
        }
      }

      // Check for unknown question codes
      for (const code of Object.keys(answersObj)) {
        if (!questionsByCode.has(code)) {
          errors.push({
            column: 'answers',
            message: `Unknown question code '${code}' for survey '${data.surveyName || resolvedSurveyId}'`,
            code: 'unknown_question',
          });
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const surveyRef = String(parsedData.surveyId || parsedData.surveyName || '').trim();
    const respondent = String(parsedData.respondentId || parsedData.respondentPhone || '').trim();
    const period = String(parsedData.period || '').trim();
    return `${surveyRef}#${respondent}#${period}`;
  }

  async commitRow(
    row: {
      id: string;
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
      batchId: string;
    },
    authz: UserAuthz,
  ): Promise<CommitRowResult> {
    const data = row.parsedData;
    const answersObj = (data._parsedAnswers as Record<string, unknown>) ?? {};
    const answers = Object.entries(answersObj).map(([questionCode, value]) => ({
      questionCode,
      value,
    }));

    const created = await this.surveyService.createResponse(
      {
        surveyId: data.surveyId as string,
        schemeId: (data.schemeId as string | undefined) ?? undefined,
        collectedAt: (data.collectedAt as string | undefined) ?? undefined,
        answers,
      },
      authz,
      authz.userId,
      null,
      row.batchId,
    );

    return { targetEntityId: created.id, beforeImage: null };
  }

  async undoRow(
    row: {
      id: string;
      rowNumber: number;
      targetEntityId: string;
      beforeImage: Record<string, unknown> | null;
      parsedData?: unknown;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult> {
    const [current] = await tx
      .select()
      .from(surveyResponse)
      .where(and(eq(surveyResponse.id, row.targetEntityId), isNull(surveyResponse.deletedAt)))
      .limit(1);

    if (!current) {
      return { skipped: true, reason: 'Record no longer exists or was already deleted' };
    }

    await tx
      .update(surveyResponse)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(surveyResponse.id, row.targetEntityId));

    return { skipped: false };
  }
}
