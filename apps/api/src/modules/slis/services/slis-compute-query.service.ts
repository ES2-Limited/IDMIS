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
   */
  private buildScopeCondition(
    schemeCol: AnyPgColumn,
    stateCol: AnyPgColumn | null,
    scope: SlisScopeParams,
  ): SQL | undefined {
    if (scope.scopeType === 'scheme' && scope.scopeOrgId) {
      return eq(schemeCol, scope.scopeOrgId);
    }
    if (scope.scopeType === 'state' && scope.scopeStateId) {
      if (stateCol) {
        return eq(stateCol, scope.scopeStateId);
      }
      return sql`EXISTS (
        SELECT 1 FROM "core"."organisation_state" "os"
        WHERE "os"."organisation_id" = ${schemeCol}
          AND "os"."state_id" = ${scope.scopeStateId}
      )`;
    }
    return undefined;
  }

  /**
   * 1a & 1b: Direct beneficiaries and % female.
   * Distinct approved farmers up to periodEnd, not deleted.
   */
  async getBeneficiaries(periodEnd: string, scope: SlisScopeParams) {
    const conditions: SQL[] = [
      eq(farmer.status, 'approved'),
      isNull(farmer.deletedAt),
      sql`${farmer.createdAt}::date <= ${periodEnd}::date`,
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
      })
      .from(farmer)
      .where(and(...conditions));

    const total = row?.total ?? 0;
    const female = row?.female ?? 0;
    const male = row?.male ?? 0;
    const femalePct = total > 0 ? ((female / total) * 100).toFixed(2) : null;

    return {
      total: String(total),
      female: String(female),
      male: String(male),
      femalePct,
    };
  }

  /**
   * 2a, 2b, 2c: Area serviced, improved, and new.
   * Σ area_ha of approved plots with service_type up to periodEnd, not deleted.
   */
  async getAreaServiced(periodEnd: string, scope: SlisScopeParams) {
    const conditions: SQL[] = [
      eq(plot.status, 'approved'),
      isNull(plot.deletedAt),
      sql`${plot.createdAt}::date <= ${periodEnd}::date`,
    ];

    const scopeCond = this.buildScopeCondition(plot.schemeId, plot.stateId, scope);
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    const [row] = await db
      .select({
        areaImproved: sql<string>`COALESCE(sum(case when ${plot.serviceType} = 'improved' then ${plot.areaHa} else 0 end), 0)::text`,
        areaNew: sql<string>`COALESCE(sum(case when ${plot.serviceType} = 'new' then ${plot.areaHa} else 0 end), 0)::text`,
      })
      .from(plot)
      .where(and(...conditions));

    const improvedNum = Number(row?.areaImproved || 0);
    const newNum = Number(row?.areaNew || 0);
    const servicedNum = improvedNum + newNum;

    return {
      areaImproved: improvedNum.toFixed(4),
      areaNew: newNum.toFixed(4),
      areaServiced: servicedNum.toFixed(4),
    };
  }

  /**
   * 3: Cropping intensity.
   * Σ crop_production.area_ha across all seasons in the calendar year to date ÷ scheme irrigable_area_ha × 100.
   * NULL / 0 irrigable area -> 'not_available'.
   */
  async getCroppingIntensity(
    year: number,
    periodEnd: string,
    scope: SlisScopeParams,
    irrigableAreaHa: string | null,
  ): Promise<{ value: string | null; status: 'computed' | 'not_available'; message?: string }> {
    const irrigableNum = Number(irrigableAreaHa);
    if (!irrigableAreaHa || isNaN(irrigableNum) || irrigableNum <= 0) {
      return {
        value: null,
        status: 'not_available',
        message: 'Irrigable area is not configured or is zero for this scope',
      };
    }

    const yearStart = `${year}-01-01`;
    const conditions: SQL[] = [
      eq(cropProduction.status, 'approved'),
      isNull(cropProduction.deletedAt),
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
        totalCroppedArea: sql<string>`COALESCE(sum(${cropProduction.areaHa}), 0)::text`,
      })
      .from(cropProduction)
      .innerJoin(season, eq(cropProduction.seasonId, season.id))
      .where(and(...conditions));

    const croppedNum = Number(row?.totalCroppedArea || 0);
    const intensity = (croppedNum / irrigableNum) * 100;

    return {
      value: intensity.toFixed(2),
      status: 'computed',
    };
  }

  /**
   * 4: Irrigation fee recovery rate by WUAs.
   * Σ collected (status recorded/approved) ÷ Σ billed × 100 for seasons in the year to date.
   * Billed = 0 -> 'not_available'.
   */
  async getFeeRecoveryRate(
    year: number,
    periodEnd: string,
    scope: SlisScopeParams,
  ): Promise<{ value: string | null; status: 'computed' | 'not_available'; message?: string }> {
    const yearStart = `${year}-01-01`;

    // 1. Total Billed
    const billedConditions: SQL[] = [
      isNull(feeBilling.deletedAt),
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
        totalBilled: sql<string>`COALESCE(sum(${feeBilling.amountNgn}), 0)::text`,
      })
      .from(feeBilling)
      .innerJoin(season, eq(feeBilling.seasonId, season.id))
      .where(and(...billedConditions));

    const billedNum = Number(billedRow?.totalBilled || 0);
    if (billedNum <= 0) {
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
        totalCollected: sql<string>`COALESCE(sum(${feeCollection.amountNgn}), 0)::text`,
      })
      .from(feeCollection)
      .innerJoin(season, eq(feeCollection.seasonId, season.id))
      .where(and(...collectedConditions));

    const collectedNum = Number(collectedRow?.totalCollected || 0);
    const recoveryRate = (collectedNum / billedNum) * 100;

    return {
      value: recoveryRate.toFixed(2),
      status: 'computed',
    };
  }

  /**
   * 6: Staff trained in dam safety assurance and management.
   * Distinct staff in trainings tagged 'dam_safety' held_on <= periodEnd.
   */
  async getTrainedDamSafety(periodEnd: string, scope: SlisScopeParams) {
    const conditions: SQL[] = [
      eq(training.status, 'approved'),
      isNull(training.deletedAt),
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
    const yearStart = `${year}-01-01`;

    const conditions: SQL[] = [
      eq(cropProduction.status, 'approved'),
      isNull(cropProduction.deletedAt),
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
        totalYieldT: sql<string>`COALESCE(sum(${cropProduction.yieldT}), 0)::text`,
      })
      .from(cropProduction)
      .innerJoin(season, eq(cropProduction.seasonId, season.id))
      .innerJoin(lookupValue, eq(cropProduction.cropTypeId, lookupValue.id))
      .innerJoin(lookupType, eq(lookupValue.lookupTypeId, lookupType.id))
      .where(and(...conditions));

    const areaNum = Number(row?.totalAreaHa || 0);
    const yieldNum = Number(row?.totalYieldT || 0);

    if (areaNum <= 0) {
      return {
        value: null,
        status: 'not_available',
        message: `No cropped area recorded for ${cropCode} in this calendar year to date`,
      };
    }

    const avgYield = yieldNum / areaNum;
    return {
      value: avgYield.toFixed(4),
      status: 'computed',
    };
  }
}
