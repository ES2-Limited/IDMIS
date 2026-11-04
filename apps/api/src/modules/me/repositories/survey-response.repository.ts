import { Injectable } from '@nestjs/common';
import {
  db,
  surveyResponse,
  surveyAnswer,
  SYSTEM_USER_ID,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  desc,
} from '@idmis/db';
import type { RequestScope, ListSurveyResponsesQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

export interface CreateSurveyResponseData {
  id?: string;
  surveyId: string;
  schemeId?: string | null;
  farmerId?: string | null;
  householdId?: string | null;
  collectedAt?: string;
  location?: unknown;
  status?: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  deviceId?: string | null;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface CreateSurveyAnswerData {
  id?: string;
  responseId: string;
  questionId: string;
  value: unknown;
}

@Injectable()
export class SurveyResponseRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(surveyResponse.id, id), isNull(surveyResponse.deletedAt)];

    if (scope && !scope.isNational) {
      const scopeCond = applyScope(scope, { scheme: surveyResponse.schemeId });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const [row] = await client
      .select()
      .from(surveyResponse)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async listResponses(query: ListSurveyResponsesQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(surveyResponse.deletedAt)];

    if (query.surveyId) {
      conditions.push(eq(surveyResponse.surveyId, query.surveyId));
    }
    if (query.schemeId) {
      conditions.push(eq(surveyResponse.schemeId, query.schemeId));
    }

    if (scope && !scope.isNational) {
      const scopeCond = applyScope(scope, { scheme: surveyResponse.schemeId });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const limit = query.limit ?? 50;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(surveyResponse)
      .where(and(...conditions));

    const items = await client
      .select()
      .from(surveyResponse)
      .where(and(...conditions))
      .orderBy(desc(surveyResponse.collectedAt))
      .limit(limit);

    return {
      items,
      total: countRes?.count ?? 0,
      limit,
    };
  }

  async create(data: CreateSurveyResponseData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const responseId = data.id ?? crypto.randomUUID();
    const [row] = await client
      .insert(surveyResponse)
      .values({
        id: responseId,
        surveyId: data.surveyId,
        schemeId: data.schemeId ?? null,
        farmerId: data.farmerId ?? null,
        householdId: data.householdId ?? null,
        collectedAt: data.collectedAt ?? new Date().toISOString(),
        location: data.location as string | null | undefined,
        status: data.status ?? 'submitted',
        submittedBy: data.submittedBy ?? data.createdBy ?? null,
        submittedAt:
          data.submittedAt ?? (data.status === 'submitted' ? new Date().toISOString() : null),
        deviceId: data.deviceId ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return row;
  }

  async createAnswer(data: CreateSurveyAnswerData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .insert(surveyAnswer)
      .values({
        id: data.id ?? crypto.randomUUID(),
        responseId: data.responseId,
        questionId: data.questionId,
        value: data.value,
      })
      .returning();

    return row;
  }

  async findAnswersByResponseId(responseId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    return client.select().from(surveyAnswer).where(eq(surveyAnswer.responseId, responseId));
  }

  async softDeleteResponse(id: string, actorUserId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .update(surveyResponse)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: actorUserId,
      })
      .where(and(eq(surveyResponse.id, id), isNull(surveyResponse.deletedAt)))
      .returning();

    return row ?? null;
  }
}
