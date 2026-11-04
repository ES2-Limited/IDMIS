import { Injectable } from '@nestjs/common';
import {
  db,
  survey,
  surveyQuestion,
  surveyResponse,
  SYSTEM_USER_ID,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  asc,
  desc,
} from '@idmis/db';
import type { RequestScope, ListSurveysQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateSurveyData {
  id?: string;
  name: string;
  version?: number;
  schemeId?: string | null;
  opensOn?: string | null;
  closesOn?: string | null;
  createdBy?: string;
}

export interface UpdateSurveyData {
  name?: string;
  schemeId?: string | null;
  opensOn?: string | null;
  closesOn?: string | null;
  updatedBy?: string;
}

export interface CreateSurveyQuestionData {
  id?: string;
  surveyId: string;
  code: string;
  text: string;
  answerType: 'text' | 'number' | 'single' | 'multi' | 'date' | 'gps';
  options?: unknown;
  sortOrder?: number;
  isRequired?: boolean;
}

export interface UpdateSurveyQuestionData {
  code?: string;
  text?: string;
  answerType?: 'text' | 'number' | 'single' | 'multi' | 'date' | 'gps';
  options?: unknown;
  sortOrder?: number;
  isRequired?: boolean;
}

@Injectable()
export class SurveyRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(survey.id, id), isNull(survey.deletedAt)];

    if (scope && !scope.isNational) {
      const scopeCond = applyScope(scope, { scheme: survey.schemeId });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const [row] = await client
      .select()
      .from(survey)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findByName(name: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(survey)
      .where(and(eq(survey.name, name), isNull(survey.deletedAt)))
      .orderBy(desc(survey.version))
      .limit(1);

    return row ?? null;
  }

  async listSurveys(query: ListSurveysQuery, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(survey.deletedAt)];

    if (query.schemeId) {
      conditions.push(eq(survey.schemeId, query.schemeId));
    }

    if (scope && !scope.isNational) {
      const scopeCond = applyScope(scope, { scheme: survey.schemeId });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const limit = query.limit ?? 50;

    const [countRes] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(survey)
      .where(and(...conditions));

    const items = await client
      .select()
      .from(survey)
      .where(and(...conditions))
      .orderBy(desc(survey.createdAt))
      .limit(limit);

    return {
      items,
      total: countRes?.count ?? 0,
      limit,
    };
  }

  async create(data: CreateSurveyData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .insert(survey)
      .values({
        id: data.id ?? crypto.randomUUID(),
        name: data.name,
        version: data.version ?? 1,
        schemeId: data.schemeId ?? null,
        opensOn: data.opensOn ?? null,
        closesOn: data.closesOn ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return row;
  }

  async update(id: string, expectedVersion: number, data: UpdateSurveyData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [updated] = await client
      .update(survey)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.schemeId !== undefined && { schemeId: data.schemeId }),
        ...(data.opensOn !== undefined && { opensOn: data.opensOn }),
        ...(data.closesOn !== undefined && { closesOn: data.closesOn }),
        ...(data.updatedBy !== undefined && { updatedBy: data.updatedBy }),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(survey.id, id), eq(survey.version, expectedVersion), isNull(survey.deletedAt)))
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      if (current) {
        throw new ConflictProblemException({
          detail: 'Survey version mismatch. Record was modified by another transaction.',
          current,
          currentVersion: current.version,
        });
      }
    }

    return updated;
  }

  async hasResponses(surveyId: string, txDb?: DatabaseOrTx): Promise<boolean> {
    const client = this.getDb(txDb);
    const [res] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(surveyResponse)
      .where(and(eq(surveyResponse.surveyId, surveyId), isNull(surveyResponse.deletedAt)));

    return (res?.count ?? 0) > 0;
  }

  async findQuestionsBySurveyId(surveyId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    return client
      .select()
      .from(surveyQuestion)
      .where(eq(surveyQuestion.surveyId, surveyId))
      .orderBy(asc(surveyQuestion.sortOrder), asc(surveyQuestion.code));
  }

  async findQuestionById(id: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(surveyQuestion)
      .where(eq(surveyQuestion.id, id))
      .limit(1);

    return row ?? null;
  }

  async findQuestionByCode(surveyId: string, code: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(surveyQuestion)
      .where(and(eq(surveyQuestion.surveyId, surveyId), eq(surveyQuestion.code, code)))
      .limit(1);

    return row ?? null;
  }

  async createQuestion(data: CreateSurveyQuestionData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .insert(surveyQuestion)
      .values({
        id: data.id ?? crypto.randomUUID(),
        surveyId: data.surveyId,
        code: data.code,
        text: data.text,
        answerType: data.answerType,
        options: data.options ?? null,
        sortOrder: data.sortOrder ?? 0,
        isRequired: data.isRequired ?? false,
      })
      .returning();

    return row;
  }

  async updateQuestion(id: string, data: UpdateSurveyQuestionData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .update(surveyQuestion)
      .set({
        ...(data.code !== undefined && { code: data.code }),
        ...(data.text !== undefined && { text: data.text }),
        ...(data.answerType !== undefined && { answerType: data.answerType }),
        ...(data.options !== undefined && { options: data.options }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
      })
      .where(eq(surveyQuestion.id, id))
      .returning();

    return row;
  }

  async deleteQuestion(id: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client.delete(surveyQuestion).where(eq(surveyQuestion.id, id)).returning();
    return row ?? null;
  }

  async createNewVersion(existingSurveyId: string, actorUserId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const existing = await this.findById(existingSurveyId, undefined, txDb);
    if (!existing) {
      return null;
    }

    const newVersion = existing.version + 1;
    const newSurveyId = crypto.randomUUID();

    const [newSurvey] = await client
      .insert(survey)
      .values({
        id: newSurveyId,
        name: existing.name,
        version: newVersion,
        schemeId: existing.schemeId,
        opensOn: existing.opensOn,
        closesOn: existing.closesOn,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      })
      .returning();

    const questions = await this.findQuestionsBySurveyId(existingSurveyId, txDb);
    for (const q of questions) {
      await client.insert(surveyQuestion).values({
        id: crypto.randomUUID(),
        surveyId: newSurveyId,
        code: q.code,
        text: q.text,
        answerType: q.answerType,
        options: q.options,
        sortOrder: q.sortOrder,
        isRequired: q.isRequired,
      });
    }

    return newSurvey;
  }
}
