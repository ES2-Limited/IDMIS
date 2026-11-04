import { Injectable, Logger } from '@nestjs/common';
import {
  db,
  wua,
  techAdoption,
  scorecard,
  surveyResponse,
  surveyAnswer,
  surveyQuestion,
  eq,
  and,
  or,
  isNull,
  sql,
  type SQL,
} from '@idmis/db';
import { SlisComputeQueryService } from '../../slis/public';

export interface ComputeContext {
  year: number;
  quarter: number;
  periodEnd: string; // 'YYYY-MM-DD'
  scope: {
    scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
    scopeStateId?: string | null;
    scopeOrgId?: string | null;
    irrigableAreaHa?: string | null;
  };
}

export interface ComputeSlotOutput {
  disaggregation: Record<string, string>;
  value: string | null;
  status: 'computed' | 'not_available' | 'error';
  message?: string;
}

export type ComputeHandler = (ctx: ComputeContext) => Promise<ComputeSlotOutput[]>;

@Injectable()
export class ComputeRegistry {
  private readonly logger = new Logger(ComputeRegistry.name);
  private readonly handlers = new Map<string, ComputeHandler>();

  constructor(private readonly slisQuery: SlisComputeQueryService) {
    this.registerHandlers();
  }

  private registerHandlers() {
    // 1a. Direct project beneficiaries
    this.handlers.set('slis.beneficiaries', async (ctx): Promise<ComputeSlotOutput[]> => {
      const res = await this.slisQuery.getBeneficiaries(ctx.periodEnd, ctx.scope);
      return [
        { disaggregation: {}, value: res.total, status: 'computed' },
        { disaggregation: { gender: 'female' }, value: res.female, status: 'computed' },
        { disaggregation: { gender: 'male' }, value: res.male, status: 'computed' },
      ];
    });

    // 1b. Female beneficiaries percentage
    this.handlers.set('slis.beneficiaries_female_pct', async (ctx) => {
      const res = await this.slisQuery.getBeneficiaries(ctx.periodEnd, ctx.scope);
      if (res.femalePct === null) {
        return [
          {
            disaggregation: {},
            value: null,
            status: 'not_available',
            message: 'No registered beneficiaries for this period',
          },
        ];
      }
      return [{ disaggregation: {}, value: res.femalePct, status: 'computed' }];
    });

    // 2a. Area provided with irrigation and drainage services
    this.handlers.set('slis.area_serviced', async (ctx) => {
      const res = await this.slisQuery.getAreaServiced(ctx.periodEnd, ctx.scope);
      return [{ disaggregation: {}, value: res.areaServiced, status: 'computed' }];
    });

    // 2b. Area provided with irrigation services - improved
    this.handlers.set('slis.area_improved', async (ctx) => {
      const res = await this.slisQuery.getAreaServiced(ctx.periodEnd, ctx.scope);
      return [{ disaggregation: {}, value: res.areaImproved, status: 'computed' }];
    });

    // 2c. Area provided with irrigation services - new
    this.handlers.set('slis.area_new', async (ctx) => {
      const res = await this.slisQuery.getAreaServiced(ctx.periodEnd, ctx.scope);
      return [{ disaggregation: {}, value: res.areaNew, status: 'computed' }];
    });

    // 3. Cropping intensity
    this.handlers.set('slis.cropping_intensity', async (ctx) => {
      const res = await this.slisQuery.getCroppingIntensity(
        ctx.year,
        ctx.periodEnd,
        ctx.scope,
        ctx.scope.irrigableAreaHa ?? null,
      );
      return [
        {
          disaggregation: {},
          value: res.value,
          status: res.status,
          message: res.message,
        },
      ];
    });

    // 4. Irrigation fee recovery rate by WUAs
    this.handlers.set('slis.fee_recovery_rate', async (ctx) => {
      const res = await this.slisQuery.getFeeRecoveryRate(ctx.year, ctx.periodEnd, ctx.scope);
      return [
        {
          disaggregation: {},
          value: res.value,
          status: res.status,
          message: res.message,
        },
      ];
    });

    // 6. Staff trained in dam safety assurance and management
    this.handlers.set('slis.trained_dam_safety', async (ctx): Promise<ComputeSlotOutput[]> => {
      const res = await this.slisQuery.getTrainedDamSafety(ctx.periodEnd, ctx.scope);
      return [
        { disaggregation: {}, value: res.total, status: 'computed' },
        { disaggregation: { gender: 'female' }, value: res.female, status: 'computed' },
        { disaggregation: { gender: 'male' }, value: res.male, status: 'computed' },
      ];
    });

    // 10. Operational WUAs created or strengthened
    this.handlers.set('core.wua_operational', async (ctx) => {
      const conditions: SQL[] = [
        eq(wua.isOperational, true),
        isNull(wua.deletedAt),
        sql`${wua.createdAt}::date <= ${ctx.periodEnd}::date`,
      ];

      if (ctx.scope.scopeType === 'scheme' && ctx.scope.scopeOrgId) {
        conditions.push(eq(wua.organisationId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state' && ctx.scope.scopeStateId) {
        conditions.push(
          or(
            eq(wua.stateId, ctx.scope.scopeStateId),
            sql`EXISTS (
              SELECT 1 FROM "core"."organisation_state" "os"
              WHERE "os"."organisation_id" = ${wua.organisationId}
                AND "os"."state_id" = ${ctx.scope.scopeStateId}
            )`,
          )!,
        );
      }

      const [row] = await db
        .select({ total: sql<number>`count(distinct ${wua.id})::int` })
        .from(wua)
        .where(and(...conditions));

      return [{ disaggregation: {}, value: String(row?.total ?? 0), status: 'computed' }];
    });

    // 11. Farmers actively participating in WUA affairs (Survey)
    this.handlers.set('me.survey.wua_participation', async (ctx) => {
      const yearStart = `${ctx.year}-01-01`;
      const conditions: SQL[] = [
        isNull(surveyResponse.deletedAt),
        sql`${surveyResponse.collectedAt}::date >= ${yearStart}::date`,
        sql`${surveyResponse.collectedAt}::date <= ${ctx.periodEnd}::date`,
        eq(surveyQuestion.code, 'wua_participation'),
      ];

      if (ctx.scope.scopeType === 'scheme' && ctx.scope.scopeOrgId) {
        conditions.push(eq(surveyResponse.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state' && ctx.scope.scopeStateId) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${surveyResponse.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      }

      const isYes = sql`lower(trim(both '"' from ${surveyAnswer.value}::text)) IN ('yes', 'true', '1')`;
      const isFemale = sql`EXISTS (
        SELECT 1 FROM "me"."survey_answer" "sa2"
        JOIN "me"."survey_question" "sq2" ON "sq2"."id" = "sa2"."question_id"
        WHERE "sa2"."response_id" = ${surveyResponse.id}
          AND lower("sq2"."code") IN ('gender', 'q_gender')
          AND lower(trim(both '"' from "sa2"."value"::text)) IN ('female', 'f')
      )`;
      const isMale = sql`EXISTS (
        SELECT 1 FROM "me"."survey_answer" "sa2"
        JOIN "me"."survey_question" "sq2" ON "sq2"."id" = "sa2"."question_id"
        WHERE "sa2"."response_id" = ${surveyResponse.id}
          AND lower("sq2"."code") IN ('gender', 'q_gender')
          AND lower(trim(both '"' from "sa2"."value"::text)) IN ('male', 'm')
      )`;

      const [row] = await db
        .select({
          totalAnswers: sql<number>`count(*)::int`,
          yesAnswers: sql<number>`count(case when ${isYes} then 1 end)::int`,
          femaleTotal: sql<number>`count(case when ${isFemale} then 1 end)::int`,
          femaleYes: sql<number>`count(case when ${isFemale} and ${isYes} then 1 end)::int`,
          maleTotal: sql<number>`count(case when ${isMale} then 1 end)::int`,
          maleYes: sql<number>`count(case when ${isMale} and ${isYes} then 1 end)::int`,
        })
        .from(surveyAnswer)
        .innerJoin(surveyResponse, eq(surveyAnswer.responseId, surveyResponse.id))
        .innerJoin(surveyQuestion, eq(surveyAnswer.questionId, surveyQuestion.id))
        .where(and(...conditions));

      const totalAnswers = row?.totalAnswers ?? 0;
      if (totalAnswers <= 0) {
        return [
          {
            disaggregation: {},
            value: null,
            status: 'not_available',
            message: 'No survey responses recorded for this period',
          },
        ];
      }

      const yesAnswers = row?.yesAnswers ?? 0;
      const totalRate = ((yesAnswers / totalAnswers) * 100).toFixed(2);
      const outputs: ComputeSlotOutput[] = [
        { disaggregation: {}, value: totalRate, status: 'computed' },
      ];

      const femaleTotal = row?.femaleTotal ?? 0;
      if (femaleTotal > 0) {
        const femaleRate = (((row?.femaleYes ?? 0) / femaleTotal) * 100).toFixed(2);
        outputs.push({
          disaggregation: { gender: 'female' },
          value: femaleRate,
          status: 'computed',
        });
      } else {
        outputs.push({
          disaggregation: { gender: 'female' },
          value: null,
          status: 'not_available',
        });
      }

      const maleTotal = row?.maleTotal ?? 0;
      if (maleTotal > 0) {
        const maleRate = (((row?.maleYes ?? 0) / maleTotal) * 100).toFixed(2);
        outputs.push({
          disaggregation: { gender: 'male' },
          value: maleRate,
          status: 'computed',
        });
      } else {
        outputs.push({
          disaggregation: { gender: 'male' },
          value: null,
          status: 'not_available',
        });
      }

      return outputs;
    });

    // 12. Clients adopting an improved agricultural technology
    this.handlers.set('me.tech_adopters', async (ctx) => {
      const conditions: SQL[] = [
        eq(techAdoption.status, 'approved'),
        isNull(techAdoption.deletedAt),
        sql`COALESCE(${techAdoption.adoptedOn}, ${techAdoption.createdAt}::date) <= ${ctx.periodEnd}::date`,
      ];

      if (ctx.scope.scopeType === 'scheme' && ctx.scope.scopeOrgId) {
        conditions.push(eq(techAdoption.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state' && ctx.scope.scopeStateId) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${techAdoption.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      }

      const [row] = await db
        .select({ total: sql<number>`count(distinct ${techAdoption.farmerId})::int` })
        .from(techAdoption)
        .where(and(...conditions));

      return [{ disaggregation: {}, value: String(row?.total ?? 0), status: 'computed' }];
    });

    // 13. Clients adopting an improved agricultural technology – female
    this.handlers.set('me.tech_adopters_female', async (ctx) => {
      const conditions: SQL[] = [
        eq(techAdoption.status, 'approved'),
        isNull(techAdoption.deletedAt),
        eq(techAdoption.gender, 'female'),
        sql`COALESCE(${techAdoption.adoptedOn}, ${techAdoption.createdAt}::date) <= ${ctx.periodEnd}::date`,
      ];

      if (ctx.scope.scopeType === 'scheme' && ctx.scope.scopeOrgId) {
        conditions.push(eq(techAdoption.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state' && ctx.scope.scopeStateId) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${techAdoption.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      }

      const [row] = await db
        .select({ total: sql<number>`count(distinct ${techAdoption.farmerId})::int` })
        .from(techAdoption)
        .where(and(...conditions));

      return [{ disaggregation: {}, value: String(row?.total ?? 0), status: 'computed' }];
    });

    // 14a–14d: Crop yields
    const crops = ['tomato', 'rice', 'maize', 'onion'];
    for (const crop of crops) {
      this.handlers.set(`slis.yield.${crop}`, async (ctx) => {
        const res = await this.slisQuery.getCropYield(crop, ctx.year, ctx.periodEnd, ctx.scope);
        return [
          {
            disaggregation: {},
            value: res.value,
            status: res.status,
            message: res.message,
          },
        ];
      });
    }

    // 16. Scheme scorecards monitored and published
    this.handlers.set('me.scorecards_published', async (ctx) => {
      const conditions: SQL[] = [
        isNull(scorecard.deletedAt),
        sql`${scorecard.publishedOn} IS NOT NULL`,
        sql`${scorecard.publishedOn} <= ${ctx.periodEnd}`,
      ];

      if (ctx.scope.scopeType === 'scheme' && ctx.scope.scopeOrgId) {
        conditions.push(eq(scorecard.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state' && ctx.scope.scopeStateId) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${scorecard.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      }

      const [row] = await db
        .select({ total: sql<number>`count(distinct ${scorecard.schemeId})::int` })
        .from(scorecard)
        .where(and(...conditions));

      return [{ disaggregation: {}, value: String(row?.total ?? 0), status: 'computed' }];
    });
  }

  async execute(computeKey: string, ctx: ComputeContext): Promise<ComputeSlotOutput[]> {
    const handler = this.handlers.get(computeKey);
    if (!handler) {
      return [
        {
          disaggregation: {},
          value: null,
          status: 'error',
          message: `Unimplemented compute key: ${computeKey}`,
        },
      ];
    }

    try {
      return await handler(ctx);
    } catch (err) {
      this.logger.error(`Error computing key "${computeKey}": ${(err as Error).message}`);
      return [
        {
          disaggregation: {},
          value: null,
          status: 'error',
          message: (err as Error).message,
        },
      ];
    }
  }
}
