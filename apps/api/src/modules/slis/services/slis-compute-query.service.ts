import { Injectable } from '@nestjs/common';
import {
  db,
  farmer,
  plot,
  cropProduction,
  season,
  feeBilling,
  feeCollection,
  training,
  trainingAttendance,
  lookupValue,
  lookupType,
  organisation,
  organisationState,
  eq,
  and,
  isNull,
  sql,
  inArray,
  type SQL,
  type AnyPgColumn,
} from '@idmis/db';

export interface SlisScopeParams {
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
}

@Injectable()
export class SlisComputeQueryService {
  /**
   * Helper to build scope condition for a table that has schemeId (and optional stateId).
   * Throws for any scope it cannot filter (rbda, sector, missing IDs).
   * Only national scope returns undefined (no filter).
   */
  buildScopeCondition(
    schemeCol: AnyPgColumn,
    stateCol: AnyPgColumn | null,
    scope: SlisScopeParams,
  ): SQL | undefined {
    if (scope.scopeType === 'national') {
      return undefined;
    }
    if (scope.scopeType === 'scheme') {
      if (!scope.scopeOrgId) {
        throw new Error('Scope type scheme requires scopeOrgId');
      }
      return eq(schemeCol, scope.scopeOrgId);
    }
    if (scope.scopeType === 'state') {
      if (!scope.scopeStateId) {
        throw new Error('Scope type state requires scopeStateId');
      }
      if (stateCol) {
        return eq(stateCol, scope.scopeStateId);
      }
      return sql`EXISTS (
        SELECT 1 FROM "core"."organisation_state" "os"
        WHERE "os"."organisation_id" = ${schemeCol}
          AND "os"."state_id" = ${scope.scopeStateId}
      )`;
    }
    throw new Error(`Unsupported scope type for SLIS compute query: ${scope.scopeType}`);
  }

  /**
   * 1a & 1b: Direct beneficiaries and % female.
   * Distinct approved farmers up to periodEnd (end of day), not deleted.
   */
  async getBeneficiaries(periodEnd: string, scope: SlisScopeParams) {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const conditions: SQL[] = [
      eq(farmer.status, 'approved'),
      isNull(farmer.deletedAt),
      sql`${farmer.approvedAt} <= ${periodEndEod}::timestamptz`,
    ];

    const scopeCond = this.buildScopeCondition(farmer.schemeId, farmer.stateId, scope);
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    const [row] = await db
      .select({
        total: sql<number>`count(distinct ${farmer.id})::int`,
        female: sql<number>`count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::int`,
        male: sql<number>`count(distinct case when ${farmer.gender} = 'male' then ${farmer.id} end)::int`,
        femalePct: sql<
          string | null
        >`case when count(distinct ${farmer.id}) > 0 then round((count(distinct case when ${farmer.gender} = 'female' then ${farmer.id} end)::numeric / count(distinct ${farmer.id})::numeric) * 100, 2)::text else null end`,
      })
      .from(farmer)
      .where(and(...conditions));

    const total = row?.total ?? 0;
    const female = row?.female ?? 0;
    const male = row?.male ?? 0;

    return {
      total: String(total),
      female: String(female),
      male: String(male),
      femalePct: row?.femalePct ?? null,
    };
  }

  /**
   * 2a, 2b, 2c: Area serviced, improved, and new.
   * Σ area_ha of approved plots with service_type up to periodEnd (end of day), not deleted.
   */
  async getAreaServiced(periodEnd: string, scope: SlisScopeParams) {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const conditions: SQL[] = [
      eq(plot.status, 'approved'),
      isNull(plot.deletedAt),
      sql`${plot.approvedAt} <= ${periodEndEod}::timestamptz`,
    ];

    const scopeCond = this.buildScopeCondition(plot.schemeId, plot.stateId, scope);
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    const [row] = await db
      .select({
        areaImproved: sql<string>`COALESCE(round(sum(case when ${plot.serviceType} = 'improved' then ${plot.areaHa} else 0 end)::numeric, 4), 0)::text`,
        areaNew: sql<string>`COALESCE(round(sum(case when ${plot.serviceType} = 'new' then ${plot.areaHa} else 0 end)::numeric, 4), 0)::text`,
        areaServiced: sql<string>`COALESCE(round(sum(case when ${plot.serviceType} in ('improved', 'new') then ${plot.areaHa} else 0 end)::numeric, 4), 0)::text`,
      })
      .from(plot)
      .where(and(...conditions));

    return {
      areaImproved: row?.areaImproved ?? '0.0000',
      areaNew: row?.areaNew ?? '0.0000',
      areaServiced: row?.areaServiced ?? '0.0000',
    };
  }

  /**
   * 3: Cropping intensity.
   * Σ crop_production.area_ha across all seasons in the calendar year to date ÷ irrigable_area_ha × 100.
   * Scheme scope: scheme irrigable area.
   * State/National scope: only schemes with irrigable_area_ha set; others excluded.
   */
  async getCroppingIntensity(
    year: number,
    periodEnd: string,
    scope: SlisScopeParams,
    irrigableAreaHa: string | null,
  ): Promise<{ value: string | null; status: 'computed' | 'not_available'; message?: string }> {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const yearStart = `${year}-01-01`;

    if (scope.scopeType === 'scheme') {
      if (!scope.scopeOrgId) {
        throw new Error('Scope type scheme requires scopeOrgId');
      }
      if (!irrigableAreaHa || Number(irrigableAreaHa) <= 0) {
        return {
          value: null,
          status: 'not_available',
          message: 'Irrigable area is not configured or is zero for this scheme',
        };
      }

      const conditions: SQL[] = [
        eq(cropProduction.status, 'approved'),
        isNull(cropProduction.deletedAt),
        sql`${cropProduction.approvedAt} <= ${periodEndEod}::timestamptz`,
        eq(cropProduction.seasonId, season.id),
        isNull(season.deletedAt),
        sql`${season.startsOn} >= ${yearStart}`,
        sql`${season.startsOn} <= ${periodEnd}`,
        eq(cropProduction.schemeId, scope.scopeOrgId),
      ];

      const [row] = await db
        .select({
          intensity: sql<string>`round((COALESCE(sum(${cropProduction.areaHa}), 0)::numeric / ${irrigableAreaHa}::numeric) * 100, 2)::text`,
        })
        .from(cropProduction)
        .innerJoin(season, eq(cropProduction.seasonId, season.id))
        .where(and(...conditions));

      return {
        value: row?.intensity ?? '0.00',
        status: 'computed',
      };
    }

    if (scope.scopeType === 'state' || scope.scopeType === 'national') {
      if (scope.scopeType === 'state' && !scope.scopeStateId) {
        throw new Error('Scope type state requires scopeStateId');
      }

      let schemesQuery;
      if (scope.scopeType === 'state') {
        schemesQuery = db
          .select({
            id: organisation.id,
            irrigableAreaHa: organisation.irrigableAreaHa,
          })
          .from(organisation)
          .innerJoin(organisationState, eq(organisationState.organisationId, organisation.id))
          .where(
            and(
              eq(organisation.type, 'scheme'),
              isNull(organisation.deletedAt),
              eq(organisationState.stateId, scope.scopeStateId!),
            ),
          );
      } else {
        schemesQuery = db
          .select({
            id: organisation.id,
            irrigableAreaHa: organisation.irrigableAreaHa,
          })
          .from(organisation)
          .where(and(eq(organisation.type, 'scheme'), isNull(organisation.deletedAt)));
      }

      const schemesInScope = await schemesQuery;
      const validSchemes = schemesInScope.filter(
        (s) => s.irrigableAreaHa !== null && Number(s.irrigableAreaHa) > 0,
      );
      const excludedCount = schemesInScope.length - validSchemes.length;

      if (validSchemes.length === 0) {
        return {
          value: null,
          status: 'not_available',
          message: `No schemes in scope have irrigable area configured (${excludedCount} schemes excluded)`,
        };
      }

      const validSchemeIds = validSchemes.map((s) => s.id);

      const [irrigableRow] = await db
        .select({
          totalIrrigable: sql<string>`round(sum(${organisation.irrigableAreaHa}::numeric), 4)::text`,
        })
        .from(organisation)
        .where(inArray(organisation.id, validSchemeIds));

      const totalIrrigable = irrigableRow?.totalIrrigable;
      if (!totalIrrigable || Number(totalIrrigable) <= 0) {
        return {
          value: null,
          status: 'not_available',
          message: `Total irrigable area is zero for schemes in scope (${excludedCount} schemes excluded)`,
        };
      }

      const conditions: SQL[] = [
        eq(cropProduction.status, 'approved'),
        isNull(cropProduction.deletedAt),
        sql`${cropProduction.approvedAt} <= ${periodEndEod}::timestamptz`,
        eq(cropProduction.seasonId, season.id),
        isNull(season.deletedAt),
        sql`${season.startsOn} >= ${yearStart}`,
        sql`${season.startsOn} <= ${periodEnd}`,
        inArray(cropProduction.schemeId, validSchemeIds),
      ];

      const [croppedRow] = await db
        .select({
          intensity: sql<string>`round((COALESCE(sum(${cropProduction.areaHa}), 0)::numeric / ${totalIrrigable}::numeric) * 100, 2)::text`,
        })
        .from(cropProduction)
        .innerJoin(season, eq(cropProduction.seasonId, season.id))
        .where(and(...conditions));

      const message =
        excludedCount > 0
          ? `${excludedCount} scheme(s) excluded due to missing irrigable area`
          : undefined;

      return {
        value: croppedRow?.intensity ?? '0.00',
        status: 'computed',
        message,
      };
    }

    throw new Error(`Unsupported scope type for cropping intensity: ${scope.scopeType}`);
  }

  /**
   * 4: Irrigation fee recovery rate by WUAs.
   * Σ collected (status recorded/approved) ÷ Σ billed × 100 for seasons in the year to date.
   * Collections use paid_on <= periodEnd.
   * Billed = 0 -> 'not_available'.
   */
  async getFeeRecoveryRate(
    year: number,
    periodEnd: string,
    scope: SlisScopeParams,
  ): Promise<{ value: string | null; status: 'computed' | 'not_available'; message?: string }> {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const yearStart = `${year}-01-01`;

    // 1. Total Billed
    const billedConditions: SQL[] = [
      isNull(feeBilling.deletedAt),
      sql`${feeBilling.approvedAt} <= ${periodEndEod}::timestamptz`,
      eq(feeBilling.seasonId, season.id),
      isNull(season.deletedAt),
      sql`${season.startsOn} >= ${yearStart}`,
      sql`${season.startsOn} <= ${periodEnd}`,
    ];
    const billedScopeCond = this.buildScopeCondition(feeBilling.schemeId, null, scope);
    if (billedScopeCond) {
      billedConditions.push(billedScopeCond);
    }

    const [billedRow] = await db
      .select({
        totalBilled: sql<string>`COALESCE(round(sum(${feeBilling.amountNgn})::numeric, 2), 0)::text`,
      })
      .from(feeBilling)
      .innerJoin(season, eq(feeBilling.seasonId, season.id))
      .where(and(...billedConditions));

    const billedStr = billedRow?.totalBilled ?? '0';
    if (Number(billedStr) <= 0) {
      return {
        value: null,
        status: 'not_available',
        message: 'No billing recorded in this calendar year to date',
      };
    }

    // 2. Total Collected
    const collectedConditions: SQL[] = [
      isNull(feeCollection.deletedAt),
      inArray(feeCollection.status, ['recorded', 'approved']),
      sql`${feeCollection.paidOn} <= ${periodEnd}`,
      eq(feeCollection.seasonId, season.id),
      isNull(season.deletedAt),
      sql`${season.startsOn} >= ${yearStart}`,
      sql`${season.startsOn} <= ${periodEnd}`,
    ];
    const collectedScopeCond = this.buildScopeCondition(feeCollection.schemeId, null, scope);
    if (collectedScopeCond) {
      collectedConditions.push(collectedScopeCond);
    }

    const [collectedRow] = await db
      .select({
        recoveryRate: sql<string>`round((COALESCE(sum(${feeCollection.amountNgn}), 0)::numeric / ${billedStr}::numeric) * 100, 2)::text`,
      })
      .from(feeCollection)
      .innerJoin(season, eq(feeCollection.seasonId, season.id))
      .where(and(...collectedConditions));

    return {
      value: collectedRow?.recoveryRate ?? '0.00',
      status: 'computed',
    };
  }

  /**
   * 6: Staff trained in dam safety assurance and management.
   * Distinct staff in trainings tagged 'dam_safety' held_on <= periodEnd and approvedAt <= periodEnd.
   */
  async getTrainedDamSafety(periodEnd: string, scope: SlisScopeParams) {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const conditions: SQL[] = [
      eq(training.status, 'approved'),
      isNull(training.deletedAt),
      sql`${training.approvedAt} <= ${periodEndEod}::timestamptz`,
      sql`${training.heldOn} <= ${periodEnd}`,
      sql`'dam_safety' = ANY(${training.tags})`,
      isNull(trainingAttendance.deletedAt),
      sql`(${trainingAttendance.staffUserId} IS NOT NULL OR ${trainingAttendance.staffName} IS NOT NULL)`,
    ];

    const scopeCond = this.buildScopeCondition(training.schemeId, null, scope);
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    const staffIdentifier = sql`COALESCE(${trainingAttendance.staffUserId}::text, lower(trim(${trainingAttendance.staffName})))`;

    const [row] = await db
      .select({
        total: sql<number>`count(distinct ${staffIdentifier})::int`,
        female: sql<number>`count(distinct case when ${trainingAttendance.gender} = 'female' then ${staffIdentifier} end)::int`,
        male: sql<number>`count(distinct case when ${trainingAttendance.gender} = 'male' then ${staffIdentifier} end)::int`,
      })
      .from(training)
      .innerJoin(trainingAttendance, eq(trainingAttendance.trainingId, training.id))
      .where(and(...conditions));

    return {
      total: String(row?.total ?? 0),
      female: String(row?.female ?? 0),
      male: String(row?.male ?? 0),
    };
  }

  /**
   * 14a–14d: Yield of main product (tomato, rice, maize, onion).
   * Σ yield_t ÷ Σ area_ha of approved crop_production for that crop type in the year to date.
   * Area = 0 -> 'not_available'.
   */
  async getCropYield(
    cropCode: string,
    year: number,
    periodEnd: string,
    scope: SlisScopeParams,
  ): Promise<{ value: string | null; status: 'computed' | 'not_available'; message?: string }> {
    const periodEndEod = `${periodEnd}T23:59:59.999Z`;
    const yearStart = `${year}-01-01`;

    const conditions: SQL[] = [
      eq(cropProduction.status, 'approved'),
      isNull(cropProduction.deletedAt),
      sql`${cropProduction.approvedAt} <= ${periodEndEod}::timestamptz`,
      eq(lookupValue.code, cropCode),
      eq(lookupType.key, 'crop_type'),
      eq(cropProduction.seasonId, season.id),
      isNull(season.deletedAt),
      sql`${season.startsOn} >= ${yearStart}`,
      sql`${season.startsOn} <= ${periodEnd}`,
    ];

    const scopeCond = this.buildScopeCondition(cropProduction.schemeId, null, scope);
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    const [row] = await db
      .select({
        totalAreaHa: sql<string>`COALESCE(sum(${cropProduction.areaHa}), 0)::text`,
        avgYield: sql<
          string | null
        >`case when COALESCE(sum(${cropProduction.areaHa}), 0) > 0 then round((sum(${cropProduction.yieldT})::numeric / sum(${cropProduction.areaHa})::numeric), 4)::text else null end`,
      })
      .from(cropProduction)
      .innerJoin(season, eq(cropProduction.seasonId, season.id))
      .innerJoin(lookupValue, eq(cropProduction.cropTypeId, lookupValue.id))
      .innerJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
      .where(and(...conditions));

    if (row?.avgYield === null) {
      return {
        value: null,
        status: 'not_available',
        message: `No cropped area recorded for ${cropCode} in this calendar year to date`,
      };
    }

    return {
      value: row.avgYield,
      status: 'computed',
    };
  }
}
