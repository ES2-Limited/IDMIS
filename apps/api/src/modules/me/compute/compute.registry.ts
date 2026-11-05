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
import { BlisComputeQueryService } from '../../blis/public';

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

  constructor(
    private readonly slisQuery: SlisComputeQueryService,
    private readonly blisQuery: BlisComputeQueryService,
  ) {
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

    // 5. Dams meeting international safety standards
    this.handlers.set('blis.dams_safe', async (ctx) => {
      const res = await this.blisQuery.getDamsSafe(ctx.periodEnd, ctx.scope);
      return [{ disaggregation: {}, value: res.total, status: 'computed' }];
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

    // 7. Rivers with discharge gauging stations
    this.handlers.set('blis.rivers_gauged', async (ctx) => {
      const res = await this.blisQuery.getRiversGauged(ctx.periodEnd, ctx.scope);
      return [{ disaggregation: {}, value: res.total, status: 'computed' }];
    });

    // 10. Operational WUAs created or strengthened
    this.handlers.set('core.wua_operational', async (ctx) => {
      const periodEndEod = `${ctx.periodEnd}T23:59:59.999Z`;
      const conditions: SQL[] = [
        eq(wua.isOperational, true),
        isNull(wua.deletedAt),
        sql`${wua.createdAt} <= ${periodEndEod}::timestamptz`,
      ];

      if (ctx.scope.scopeType === 'scheme') {
        if (!ctx.scope.scopeOrgId) {
          throw new Error('Scope type scheme requires scopeOrgId');
        }
        conditions.push(eq(wua.organisationId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state') {
        if (!ctx.scope.scopeStateId) {
          throw new Error('Scope type state requires scopeStateId');
        }
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
      } else if (ctx.scope.scopeType !== 'national') {
        throw new Error(`Unsupported scope type for core.wua_operational: ${ctx.scope.scopeType}`);
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

      if (ctx.scope.scopeType === 'scheme') {
        if (!ctx.scope.scopeOrgId) {
          throw new Error('Scope type scheme requires scopeOrgId');
        }
        conditions.push(eq(surveyResponse.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state') {
        if (!ctx.scope.scopeStateId) {
          throw new Error('Scope type state requires scopeStateId');
        }
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${surveyResponse.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      } else if (ctx.scope.scopeType !== 'national') {
        throw new Error(
          `Unsupported scope type for me.survey.wua_participation: ${ctx.scope.scopeType}`,
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
          totalRate: sql<
            string | null
          >`case when count(*) > 0 then round((count(case when ${isYes} then 1 end)::numeric / count(*)::numeric) * 100, 2)::text else null end`,
          femaleTotal: sql<number>`count(case when ${isFemale} then 1 end)::int`,
          femaleRate: sql<
            string | null
          >`case when count(case when ${isFemale} then 1 end) > 0 then round((count(case when ${isFemale} and ${isYes} then 1 end)::numeric / count(case when ${isFemale} then 1 end)::numeric) * 100, 2)::text else null end`,
          maleTotal: sql<number>`count(case when ${isMale} then 1 end)::int`,
          maleRate: sql<
            string | null
          >`case when count(case when ${isMale} then 1 end) > 0 then round((count(case when ${isMale} and ${isYes} then 1 end)::numeric / count(case when ${isMale} then 1 end)::numeric) * 100, 2)::text else null end`,
        })
        .from(surveyAnswer)
        .innerJoin(surveyResponse, eq(surveyAnswer.responseId, surveyResponse.id))
        .innerJoin(surveyQuestion, eq(surveyAnswer.questionId, surveyQuestion.id))
        .where(and(...conditions));

      const totalAnswers = row?.totalAnswers ?? 0;
      if (totalAnswers <= 0 || row?.totalRate === null) {
        return [
          {
            disaggregation: {},
            value: null,
            status: 'not_available',
            message: 'No survey responses recorded for this period',
          },
        ];
      }

      const outputs: ComputeSlotOutput[] = [
        { disaggregation: {}, value: row.totalRate, status: 'computed' },
      ];

      const femaleTotal = row?.femaleTotal ?? 0;
      if (femaleTotal > 0 && row?.femaleRate !== null) {
        outputs.push({
          disaggregation: { gender: 'female' },
          value: row.femaleRate,
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
      if (maleTotal > 0 && row?.maleRate !== null) {
        outputs.push({
          disaggregation: { gender: 'male' },
          value: row.maleRate,
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
      const periodEndEod = `${ctx.periodEnd}T23:59:59.999Z`;
      const conditions: SQL[] = [
        eq(techAdoption.status, 'approved'),
        isNull(techAdoption.deletedAt),
        sql`${techAdoption.approvedAt} <= ${periodEndEod}::timestamptz`,
      ];

      if (ctx.scope.scopeType === 'scheme') {
        if (!ctx.scope.scopeOrgId) {
          throw new Error('Scope type scheme requires scopeOrgId');
        }
        conditions.push(eq(techAdoption.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state') {
        if (!ctx.scope.scopeStateId) {
          throw new Error('Scope type state requires scopeStateId');
        }
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${techAdoption.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      } else if (ctx.scope.scopeType !== 'national') {
        throw new Error(`Unsupported scope type for me.tech_adopters: ${ctx.scope.scopeType}`);
      }

      const [row] = await db
        .select({ total: sql<number>`count(distinct ${techAdoption.farmerId})::int` })
        .from(techAdoption)
        .where(and(...conditions));

      return [{ disaggregation: {}, value: String(row?.total ?? 0), status: 'computed' }];
    });

    // 13. Clients adopting an improved agricultural technology – female
    this.handlers.set('me.tech_adopters_female', async (ctx) => {
      const periodEndEod = `${ctx.periodEnd}T23:59:59.999Z`;
      const conditions: SQL[] = [
        eq(techAdoption.status, 'approved'),
        isNull(techAdoption.deletedAt),
        eq(techAdoption.gender, 'female'),
        sql`${techAdoption.approvedAt} <= ${periodEndEod}::timestamptz`,
      ];

      if (ctx.scope.scopeType === 'scheme') {
        if (!ctx.scope.scopeOrgId) {
          throw new Error('Scope type scheme requires scopeOrgId');
        }
        conditions.push(eq(techAdoption.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state') {
        if (!ctx.scope.scopeStateId) {
          throw new Error('Scope type state requires scopeStateId');
        }
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${techAdoption.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      } else if (ctx.scope.scopeType !== 'national') {
        throw new Error(
          `Unsupported scope type for me.tech_adopters_female: ${ctx.scope.scopeType}`,
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

      if (ctx.scope.scopeType === 'scheme') {
        if (!ctx.scope.scopeOrgId) {
          throw new Error('Scope type scheme requires scopeOrgId');
        }
        conditions.push(eq(scorecard.schemeId, ctx.scope.scopeOrgId));
      } else if (ctx.scope.scopeType === 'state') {
        if (!ctx.scope.scopeStateId) {
          throw new Error('Scope type state requires scopeStateId');
        }
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "core"."organisation_state" "os"
            WHERE "os"."organisation_id" = ${scorecard.schemeId}
              AND "os"."state_id" = ${ctx.scope.scopeStateId}
          )`,
        );
      } else if (ctx.scope.scopeType !== 'national') {
        throw new Error(
          `Unsupported scope type for me.scorecards_published: ${ctx.scope.scopeType}`,
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
