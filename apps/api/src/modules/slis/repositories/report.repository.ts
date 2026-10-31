import { Injectable } from '@nestjs/common';
import {
  db,
  mvFarmersByScope,
  mvAreaByService,
  mvCropping,
  mvFeeRecovery,
  reportRefresh,
  organisation,
  state,
  season,
  lookupValue,
  wua,
  and,
  eq,
  sql,
  alias,
  type SQL,
} from '@idmis/db';
import type {
  RequestScope,
  FarmersByScopeQuery,
  FarmersByScopeResponse,
  AreaByServiceQuery,
  AreaByServiceResponse,
  CroppingQuery,
  CroppingResponse,
  FeeRecoveryQuery,
  FeeRecoveryResponse,
  WuaSummaryQuery,
  WuaSummaryResponse,
} from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';

function toMoneyString(val: unknown): string {
  if (val == null) return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

function toHaString(val: unknown): string {
  if (val == null) return '0.0000';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0.0000' : num.toFixed(4);
}

function toPctString(val: unknown): string | null {
  if (val == null) return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? null : num.toFixed(2);
}

@Injectable()
export class ReportRepository {
  async getLastRefreshedAt(): Promise<string | null> {
    const [row] = await db
      .select({ refreshedAt: reportRefresh.refreshedAt })
      .from(reportRefresh)
      .where(eq(reportRefresh.id, 1))
      .limit(1);
    return row?.refreshedAt ?? null;
  }

  async refreshViews(): Promise<void> {
    await db.execute(sql`SELECT slis.refresh_report_views();`);
  }

  async getFarmersByScope(
    scope: RequestScope,
    query: Partial<FarmersByScopeQuery> = {},
  ): Promise<FarmersByScopeResponse> {
    const schemeOrg = alias(organisation, 'scheme_org');
    const sectorOrg = alias(organisation, 'sector_org');

    const conditions: SQL[] = [];
    const scopeCond = applyScope(scope, {
      scheme: mvFarmersByScope.schemeId,
      state: mvFarmersByScope.stateId,
    });
    if (scopeCond) conditions.push(scopeCond);

    if (query.schemeId) conditions.push(eq(mvFarmersByScope.schemeId, query.schemeId));
    if (query.sectorId) conditions.push(eq(mvFarmersByScope.sectorId, query.sectorId));
    if (query.stateId) conditions.push(eq(mvFarmersByScope.stateId, query.stateId));
    if (query.gender) conditions.push(eq(mvFarmersByScope.gender, query.gender));

    const rows = await db
      .select({
        schemeId: mvFarmersByScope.schemeId,
        schemeName: schemeOrg.name,
        sectorId: mvFarmersByScope.sectorId,
        sectorName: sectorOrg.name,
        stateId: mvFarmersByScope.stateId,
        stateName: state.name,
        gender: mvFarmersByScope.gender,
        farmerCount: mvFarmersByScope.farmerCount,
      })
      .from(mvFarmersByScope)
      .leftJoin(schemeOrg, eq(mvFarmersByScope.schemeId, schemeOrg.id))
      .leftJoin(sectorOrg, eq(mvFarmersByScope.sectorId, sectorOrg.id))
      .leftJoin(state, eq(mvFarmersByScope.stateId, state.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    let totalFarmers = 0;
    const items = rows.map((r) => {
      const count = Number(r.farmerCount) || 0;
      totalFarmers += count;
      return {
        schemeId: r.schemeId,
        schemeName: r.schemeName ?? undefined,
        sectorId: r.sectorId,
        sectorName: r.sectorName ?? null,
        stateId: r.stateId ?? '00000000-0000-0000-0000-000000000000',
        stateName: r.stateName ?? undefined,
        gender: r.gender as 'female' | 'male',
        farmerCount: count,
      };
    });

    const lastRefreshedAt = await this.getLastRefreshedAt();
    return { items, totalFarmers, lastRefreshedAt };
  }

  async getAreaByService(
    scope: RequestScope,
    query: Partial<AreaByServiceQuery> = {},
  ): Promise<AreaByServiceResponse> {
    const schemeOrg = alias(organisation, 'scheme_org');

    const conditions: SQL[] = [];
    const scopeCond = applyScope(scope, {
      scheme: mvAreaByService.schemeId,
      state: mvAreaByService.stateId,
    });
    if (scopeCond) conditions.push(scopeCond);

    if (query.schemeId) conditions.push(eq(mvAreaByService.schemeId, query.schemeId));
    if (query.stateId) conditions.push(eq(mvAreaByService.stateId, query.stateId));
    if (query.serviceType) conditions.push(eq(mvAreaByService.serviceType, query.serviceType));

    const rows = await db
      .select({
        schemeId: mvAreaByService.schemeId,
        schemeName: schemeOrg.name,
        stateId: mvAreaByService.stateId,
        stateName: state.name,
        serviceType: mvAreaByService.serviceType,
        totalHa: mvAreaByService.totalHa,
        plotCount: mvAreaByService.plotCount,
      })
      .from(mvAreaByService)
      .leftJoin(schemeOrg, eq(mvAreaByService.schemeId, schemeOrg.id))
      .leftJoin(state, eq(mvAreaByService.stateId, state.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    let sumHa = 0;
    let totalPlots = 0;

    const items = rows.map((r) => {
      const ha = parseFloat(String(r.totalHa)) || 0;
      const plots = Number(r.plotCount) || 0;
      sumHa += ha;
      totalPlots += plots;

      return {
        schemeId: r.schemeId,
        schemeName: r.schemeName ?? undefined,
        stateId: r.stateId ?? '00000000-0000-0000-0000-000000000000',
        stateName: r.stateName ?? undefined,
        serviceType: (r.serviceType ?? 'none') as 'new' | 'improved' | 'none',
        totalAreaHa: toHaString(r.totalHa),
        plotCount: plots,
      };
    });

    const lastRefreshedAt = await this.getLastRefreshedAt();
    return {
      items,
      totalAreaHa: toHaString(sumHa),
      totalPlots,
      lastRefreshedAt,
    };
  }

  async getCropping(
    scope: RequestScope,
    query: Partial<CroppingQuery> = {},
  ): Promise<CroppingResponse> {
    const schemeOrg = alias(organisation, 'scheme_org');

    const conditions: SQL[] = [];
    const scopeCond = applyScope(scope, {
      scheme: mvCropping.schemeId,
      state: mvCropping.stateId,
    });
    if (scopeCond) conditions.push(scopeCond);

    if (query.schemeId) conditions.push(eq(mvCropping.schemeId, query.schemeId));
    if (query.seasonId) conditions.push(eq(mvCropping.seasonId, query.seasonId));
    if (query.cropTypeId) conditions.push(eq(mvCropping.cropTypeId, query.cropTypeId));

    const rows = await db
      .select({
        schemeId: mvCropping.schemeId,
        schemeName: schemeOrg.name,
        seasonId: mvCropping.seasonId,
        seasonName: season.name,
        cropTypeId: mvCropping.cropTypeId,
        cropTypeName: lookupValue.label,
        totalAreaHa: mvCropping.totalAreaHa,
        totalYieldT: mvCropping.totalYieldT,
        avgYieldTHa: mvCropping.avgYieldTHa,
      })
      .from(mvCropping)
      .leftJoin(schemeOrg, eq(mvCropping.schemeId, schemeOrg.id))
      .leftJoin(season, eq(mvCropping.seasonId, season.id))
      .leftJoin(lookupValue, eq(mvCropping.cropTypeId, lookupValue.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    let sumAreaHa = 0;
    const items = rows.map((r) => {
      const area = parseFloat(String(r.totalAreaHa)) || 0;
      sumAreaHa += area;

      return {
        schemeId: r.schemeId,
        schemeName: r.schemeName ?? undefined,
        seasonId: r.seasonId,
        seasonName: r.seasonName ?? undefined,
        cropTypeId: r.cropTypeId,
        cropTypeName: r.cropTypeName ?? undefined,
        totalAreaHa: toHaString(r.totalAreaHa),
        totalYieldT: r.totalYieldT != null ? String(r.totalYieldT) : null,
        avgYieldTHa: r.avgYieldTHa != null ? toHaString(r.avgYieldTHa) : null,
      };
    });

    const lastRefreshedAt = await this.getLastRefreshedAt();
    return {
      items,
      totalCroppedAreaHa: toHaString(sumAreaHa),
      lastRefreshedAt,
    };
  }

  async getFeeRecovery(
    scope: RequestScope,
    query: Partial<FeeRecoveryQuery> = {},
  ): Promise<FeeRecoveryResponse> {
    const schemeOrg = alias(organisation, 'scheme_org');

    const conditions: SQL[] = [];
    const scopeCond = applyScope(scope, {
      scheme: mvFeeRecovery.schemeId,
      state: mvFeeRecovery.stateId,
    });
    if (scopeCond) conditions.push(scopeCond);

    if (query.schemeId) conditions.push(eq(mvFeeRecovery.schemeId, query.schemeId));
    if (query.wuaId) conditions.push(eq(mvFeeRecovery.wuaId, query.wuaId));
    if (query.seasonId) conditions.push(eq(mvFeeRecovery.seasonId, query.seasonId));

    const rows = await db
      .select({
        schemeId: mvFeeRecovery.schemeId,
        schemeName: schemeOrg.name,
        stateId: mvFeeRecovery.stateId,
        seasonId: mvFeeRecovery.seasonId,
        seasonName: season.name,
        wuaId: mvFeeRecovery.wuaId,
        wuaName: wua.name,
        billedNgn: mvFeeRecovery.billedNgn,
        collectedNgn: mvFeeRecovery.collectedNgn,
        recoveryRatePct: mvFeeRecovery.recoveryRatePct,
      })
      .from(mvFeeRecovery)
      .leftJoin(schemeOrg, eq(mvFeeRecovery.schemeId, schemeOrg.id))
      .leftJoin(season, eq(mvFeeRecovery.seasonId, season.id))
      .leftJoin(wua, eq(mvFeeRecovery.wuaId, wua.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    let sumBilled = 0;
    let sumCollected = 0;

    const items = rows.map((r) => {
      const billed = parseFloat(String(r.billedNgn)) || 0;
      const collected = parseFloat(String(r.collectedNgn)) || 0;
      sumBilled += billed;
      sumCollected += collected;

      return {
        schemeId: r.schemeId,
        schemeName: r.schemeName ?? undefined,
        stateId: r.stateId ?? undefined,
        wuaId: r.wuaId,
        wuaName: r.wuaName ?? null,
        seasonId: r.seasonId,
        seasonName: r.seasonName ?? undefined,
        billedNgn: toMoneyString(r.billedNgn),
        collectedNgn: toMoneyString(r.collectedNgn),
        recoveryRatePct: toPctString(r.recoveryRatePct),
      };
    });

    const overallRecoveryRatePct =
      sumBilled > 0 ? ((sumCollected / sumBilled) * 100).toFixed(2) : null;
    const lastRefreshedAt = await this.getLastRefreshedAt();

    return {
      items,
      totalBilledNgn: toMoneyString(sumBilled),
      totalCollectedNgn: toMoneyString(sumCollected),
      overallRecoveryRatePct,
      lastRefreshedAt,
    };
  }

  async getWuaSummaries(
    scope: RequestScope,
    query: Partial<WuaSummaryQuery> = {},
  ): Promise<WuaSummaryResponse> {
    const schemeOrg = alias(organisation, 'scheme_org');

    const conditions: SQL[] = [sql`${wua.deletedAt} IS NULL`];
    const scopeCond = applyScope(scope, {
      scheme: wua.organisationId,
      state: wua.stateId,
    });
    if (scopeCond) conditions.push(scopeCond);

    if (query.schemeId) conditions.push(eq(wua.organisationId, query.schemeId));
    if (query.stateId) conditions.push(eq(wua.stateId, query.stateId));
    if (query.level) conditions.push(eq(wua.level, query.level));
    if (query.isOperational !== undefined)
      conditions.push(eq(wua.isOperational, query.isOperational));

    const rows = await db
      .select({
        wuaId: wua.id,
        wuaName: wua.name,
        regNo: wua.regNo,
        level: wua.level,
        schemeId: wua.organisationId,
        schemeName: schemeOrg.name,
        stateId: wua.stateId,
        stateName: state.name,
        isOperational: wua.isOperational,
        hasMaintenanceFund: wua.hasMaintenanceFund,
        farmerCount: sql<number>`(
          SELECT COUNT(*)::int FROM "slis"."farmer" f
          WHERE f."unit_wua_id" = ${wua.id} AND f."status" = 'approved' AND f."deleted_at" IS NULL
        )`,
        officerCount: sql<number>`(
          SELECT COUNT(*)::int FROM "core"."wua_officer" wo
          WHERE wo."wua_id" = ${wua.id} AND wo."deleted_at" IS NULL
        )`,
      })
      .from(wua)
      .leftJoin(schemeOrg, eq(wua.organisationId, schemeOrg.id))
      .leftJoin(state, eq(wua.stateId, state.id))
      .where(and(...conditions))
      .orderBy(wua.name);

    const items = rows.map((r) => ({
      wuaId: r.wuaId,
      wuaName: r.wuaName,
      regNo: r.regNo ?? null,
      level: r.level,
      schemeId: r.schemeId,
      schemeName: r.schemeName ?? undefined,
      stateId: r.stateId ?? null,
      stateName: r.stateName ?? undefined,
      isOperational: r.isOperational,
      hasMaintenanceFund: r.hasMaintenanceFund,
      farmerCount: Number(r.farmerCount) || 0,
      officerCount: Number(r.officerCount) || 0,
    }));

    const lastRefreshedAt = await this.getLastRefreshedAt();
    return {
      items,
      totalWuas: items.length,
      lastRefreshedAt,
    };
  }
}
