import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  permissions,
  type DashboardQuery,
  type DashboardResponse,
  type DashboardFarmers,
  type DashboardArea,
  type DashboardFeeRecovery,
  type DashboardIndicatorProgressItem,
  type DashboardChildSummary,
  type DashboardDamStatus,
  type RequestScope,
} from '@idmis/contracts';
import { GeographyRepository, OrganisationRepository } from '../../core/public';
import { ReportRepository } from '../../slis/public';
import { IndicatorMatrixRepository } from '../../me/public';
import { BlisPublicService } from '../../blis/public';
import { RedisService } from '../../../platform/redis/redis.service';
import type { UserAuthz } from '../../../platform/auth';

function toHaString(val: unknown): string {
  if (val == null) return '0.0000';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0.0000' : num.toFixed(4);
}

function toMoneyString(val: unknown): string {
  if (val == null) return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(forwardRef(() => GeographyRepository))
    private readonly geographyRepo: GeographyRepository,
    @Inject(forwardRef(() => OrganisationRepository))
    private readonly organisationRepo: OrganisationRepository,
    @Inject(forwardRef(() => ReportRepository)) private readonly reportRepo: ReportRepository,
    @Inject(forwardRef(() => IndicatorMatrixRepository))
    private readonly indicatorMatrixRepo: IndicatorMatrixRepository,
    @Inject(forwardRef(() => BlisPublicService)) private readonly blisService: BlisPublicService,
    @Inject(forwardRef(() => RedisService)) private readonly redisService: RedisService,
  ) {}

  async invalidateCache(): Promise<void> {
    await this.redisService.incr('dashboard:cache:epoch');
  }

  private computeScopeHash(scope: RequestScope): string {
    const raw = JSON.stringify({
      isNational: scope.isNational,
      stateIds: [...(scope.stateIds ?? [])].sort(),
      schemeIds: [...(scope.schemeIds ?? [])].sort(),
    });
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  private computeFilterHash(obj: Record<string, unknown>): string {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      if (obj[k] !== undefined) {
        sortedObj[k] = obj[k];
      }
    }
    return createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex').substring(0, 16);
  }

  private aggregateFarmers(
    items: Array<{ gender: string; farmerCount: number }>,
  ): DashboardFarmers {
    let total = 0;
    const byGender: Record<string, number> = {};
    for (const item of items) {
      const count = Number(item.farmerCount) || 0;
      total += count;
      const g = item.gender || 'unknown';
      byGender[g] = (byGender[g] || 0) + count;
    }
    return { total, byGender };
  }

  private aggregateArea(items: Array<{ serviceType: string; totalAreaHa: string }>): DashboardArea {
    let sumHa = 0;
    const byServiceType: Record<string, string> = {};
    const numericByType: Record<string, number> = {};

    for (const item of items) {
      const ha = parseFloat(String(item.totalAreaHa)) || 0;
      sumHa += ha;
      const st = item.serviceType || 'none';
      numericByType[st] = (numericByType[st] || 0) + ha;
    }

    for (const [k, v] of Object.entries(numericByType)) {
      byServiceType[k] = toHaString(v);
    }

    return {
      totalHa: toHaString(sumHa),
      byServiceType,
    };
  }

  private aggregateFeeRecovery(
    items: Array<{ billedNgn: string; collectedNgn: string }>,
  ): DashboardFeeRecovery {
    let sumBilled = 0;
    let sumCollected = 0;

    for (const item of items) {
      sumBilled += parseFloat(String(item.billedNgn)) || 0;
      sumCollected += parseFloat(String(item.collectedNgn)) || 0;
    }

    const rate = sumBilled > 0 ? ((sumCollected / sumBilled) * 100).toFixed(2) : null;

    return {
      billed: toMoneyString(sumBilled),
      collected: toMoneyString(sumCollected),
      rate,
    };
  }

  private aggregateIndicators(
    items: Array<{
      indicatorId: string;
      indicatorCode: string;
      indicatorName: string;
      value: string | number | null;
      endTarget: string | number | null;
      pctOfEndTarget: string | number | null;
      status: string;
      disaggregation?: Record<string, string>;
    }>,
  ): DashboardIndicatorProgressItem[] {
    const map = new Map<string, DashboardIndicatorProgressItem>();
    for (const m of items) {
      const isTotal = !m.disaggregation || Object.keys(m.disaggregation).length === 0;
      if (!map.has(m.indicatorCode) || isTotal) {
        map.set(m.indicatorCode, {
          indicatorId: m.indicatorId,
          indicatorCode: m.indicatorCode,
          indicatorName: m.indicatorName,
          value: m.value != null ? String(m.value) : null,
          endTarget: m.endTarget != null ? String(m.endTarget) : null,
          pctOfEndTarget: m.pctOfEndTarget != null ? String(m.pctOfEndTarget) : null,
          status: m.status,
        });
      }
    }
    return Array.from(map.values());
  }

  async getProgrammeDashboard(query: DashboardQuery, authz: UserAuthz): Promise<DashboardResponse> {
    const scope = authz.scopeFor(permissions.DASHBOARD_VIEW);
    if (!scope.isNational) {
      throw new NotFoundException('Programme dashboard not found or out of scope');
    }

    const year = query.year ?? new Date().getFullYear();
    const quarter = query.quarter ?? Math.floor(new Date().getMonth() / 3) + 1;

    // Cache lookup
    const scopeHash = this.computeScopeHash(scope);
    const filterHash = this.computeFilterHash({ ...query, year, quarter });
    const epoch = (await this.redisService.get('dashboard:cache:epoch')) ?? '0';
    const cacheKey = `dashboard:cache:${epoch}:programme:national:${scopeHash}:${filterHash}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DashboardResponse;
    }

    const schemeFilter = query.scheme ?? query.schemeId;
    const sectorFilter = query.sector ?? query.sectorId;
    const seasonFilter = query.season ?? query.seasonId;

    const [farmersRes, areaRes, feeRes, matrixRes, damStatusSummary, damStatusByState, states] =
      await Promise.all([
        this.reportRepo.getFarmersByScope(scope, {
          schemeId: schemeFilter,
          sectorId: sectorFilter,
        }),
        this.reportRepo.getAreaByService(scope, {
          schemeId: schemeFilter,
        }),
        this.reportRepo.getFeeRecovery(scope, {
          schemeId: schemeFilter,
          seasonId: seasonFilter,
        }),
        this.indicatorMatrixRepo.getMatrix(
          {
            year,
            quarter,
            scopeType: 'national',
          },
          scope,
        ),
        this.blisService.getDamStatusSummary({ schemeId: schemeFilter }),
        this.blisService.getDamStatusByState(),
        this.geographyRepo.listStates(),
      ]);

    const headlineFarmers = this.aggregateFarmers(farmersRes.items);
    const headlineArea = this.aggregateArea(areaRes.items);
    const headlineFee = this.aggregateFeeRecovery(feeRes.items);
    const indicatorProgress = this.aggregateIndicators(matrixRes.items);
    const headlineDamStatus: DashboardDamStatus = {
      meetingStandard: damStatusSummary.meetingStandard,
      notMeetingStandard: damStatusSummary.notMeetingStandard,
      overdue: damStatusSummary.overdue,
      total: damStatusSummary.total,
    };

    const meRefreshedAt = await this.indicatorMatrixRepo.getLastRefreshedAt();
    const lastRefreshedAt = {
      slis: farmersRes.lastRefreshedAt ?? areaRes.lastRefreshedAt ?? feeRes.lastRefreshedAt ?? null,
      me: meRefreshedAt,
      blis: damStatusSummary.lastRefreshedAt,
    };

    // Build children: States
    const children: DashboardChildSummary[] = states.map((s) => {
      const stateFarmersItems = farmersRes.items.filter((i) => i.stateId === s.id);
      const stateAreaItems = areaRes.items.filter((i) => i.stateId === s.id);
      const stateFeeItems = feeRes.items.filter((i) => i.stateId === s.id);
      const stateDam = damStatusByState.get(s.id) ?? {
        id: s.id,
        meetingStandard: 0,
        notMeetingStandard: 0,
        overdue: 0,
        total: 0,
      };

      return {
        id: s.id,
        name: s.name,
        code: s.code,
        type: 'state',
        farmers: this.aggregateFarmers(stateFarmersItems),
        area: this.aggregateArea(stateAreaItems),
        feeRecovery: this.aggregateFeeRecovery(stateFeeItems),
        indicatorProgress: [],
        damStatus: {
          meetingStandard: stateDam.meetingStandard,
          notMeetingStandard: stateDam.notMeetingStandard,
          overdue: stateDam.overdue,
          total: stateDam.total,
        },
      };
    });

    const response: DashboardResponse = {
      level: 'programme',
      scopeId: null,
      scopeName: 'National Programme',
      year,
      quarter,
      farmers: headlineFarmers,
      area: headlineArea,
      feeRecovery: headlineFee,
      indicatorProgress,
      damStatus: headlineDamStatus,
      lastRefreshedAt,
      children,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 60);
    return response;
  }

  async getStateDashboard(
    stateId: string,
    query: DashboardQuery,
    authz: UserAuthz,
  ): Promise<DashboardResponse> {
    const states = await this.geographyRepo.listStates();
    const targetState = states.find((s) => s.id === stateId);
    if (!targetState) {
      throw new NotFoundException('State not found');
    }

    const scope = authz.scopeFor(permissions.DASHBOARD_VIEW);
    if (!scope.isNational && !scope.stateIds.includes(stateId)) {
      throw new NotFoundException('State not found or out of scope');
    }

    const year = query.year ?? new Date().getFullYear();
    const quarter = query.quarter ?? Math.floor(new Date().getMonth() / 3) + 1;

    // Cache lookup
    const scopeHash = this.computeScopeHash(scope);
    const filterHash = this.computeFilterHash({ ...query, year, quarter });
    const epoch = (await this.redisService.get('dashboard:cache:epoch')) ?? '0';
    const cacheKey = `dashboard:cache:${epoch}:state:${stateId}:${scopeHash}:${filterHash}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DashboardResponse;
    }

    const schemeFilter = query.scheme ?? query.schemeId;
    const sectorFilter = query.sector ?? query.sectorId;
    const seasonFilter = query.season ?? query.seasonId;

    const [
      farmersRes,
      areaRes,
      feeRes,
      matrixRes,
      damStatusSummary,
      damStatusByScheme,
      childSchemes,
    ] = await Promise.all([
      this.reportRepo.getFarmersByScope(scope, {
        stateId,
        schemeId: schemeFilter,
        sectorId: sectorFilter,
      }),
      this.reportRepo.getAreaByService(scope, {
        stateId,
        schemeId: schemeFilter,
      }),
      this.reportRepo.getFeeRecovery(scope, {
        schemeId: schemeFilter,
        seasonId: seasonFilter,
      }),
      this.indicatorMatrixRepo.getMatrix(
        {
          year,
          quarter,
          scopeType: 'state',
          scopeId: stateId,
        },
        scope,
      ),
      this.blisService.getDamStatusSummary({ stateId, schemeId: schemeFilter }),
      this.blisService.getDamStatusByScheme(stateId),
      this.organisationRepo.listOrganisations({ type: 'scheme', stateId, isActive: true }),
    ]);

    const stateFeeItems = feeRes.items.filter((i) => i.stateId === stateId);
    const headlineFarmers = this.aggregateFarmers(farmersRes.items);
    const headlineArea = this.aggregateArea(areaRes.items);
    const headlineFee = this.aggregateFeeRecovery(stateFeeItems);
    const indicatorProgress = this.aggregateIndicators(matrixRes.items);
    const headlineDamStatus: DashboardDamStatus = {
      meetingStandard: damStatusSummary.meetingStandard,
      notMeetingStandard: damStatusSummary.notMeetingStandard,
      overdue: damStatusSummary.overdue,
      total: damStatusSummary.total,
    };

    const meRefreshedAt = await this.indicatorMatrixRepo.getLastRefreshedAt();
    const lastRefreshedAt = {
      slis: farmersRes.lastRefreshedAt ?? areaRes.lastRefreshedAt ?? feeRes.lastRefreshedAt ?? null,
      me: meRefreshedAt,
      blis: damStatusSummary.lastRefreshedAt,
    };

    // Build children: Schemes in this state
    const children: DashboardChildSummary[] = childSchemes.map((sc) => {
      const schemeFarmersItems = farmersRes.items.filter((i) => i.schemeId === sc.id);
      const schemeAreaItems = areaRes.items.filter((i) => i.schemeId === sc.id);
      const schemeFeeItems = feeRes.items.filter((i) => i.schemeId === sc.id);
      const schemeDam = damStatusByScheme.get(sc.id) ?? {
        id: sc.id,
        meetingStandard: 0,
        notMeetingStandard: 0,
        overdue: 0,
        total: 0,
      };

      return {
        id: sc.id,
        name: sc.name,
        code: sc.code,
        type: 'scheme',
        farmers: this.aggregateFarmers(schemeFarmersItems),
        area: this.aggregateArea(schemeAreaItems),
        feeRecovery: this.aggregateFeeRecovery(schemeFeeItems),
        indicatorProgress: [],
        damStatus: {
          meetingStandard: schemeDam.meetingStandard,
          notMeetingStandard: schemeDam.notMeetingStandard,
          overdue: schemeDam.overdue,
          total: schemeDam.total,
        },
      };
    });

    const response: DashboardResponse = {
      level: 'state',
      scopeId: stateId,
      scopeName: targetState.name,
      year,
      quarter,
      farmers: headlineFarmers,
      area: headlineArea,
      feeRecovery: headlineFee,
      indicatorProgress,
      damStatus: headlineDamStatus,
      lastRefreshedAt,
      children,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 60);
    return response;
  }

  async getSchemeDashboard(
    schemeId: string,
    query: DashboardQuery,
    authz: UserAuthz,
  ): Promise<DashboardResponse> {
    const schemes = await this.organisationRepo.listOrganisations({ type: 'scheme' });
    const targetScheme = schemes.find((s) => s.id === schemeId);
    if (!targetScheme) {
      throw new NotFoundException('Scheme not found');
    }

    const scope = authz.scopeFor(permissions.DASHBOARD_VIEW);
    let allowed = scope.isNational || scope.schemeIds.includes(schemeId);
    if (!allowed && targetScheme.stateIds && targetScheme.stateIds.length > 0) {
      allowed = targetScheme.stateIds.some((sId) => scope.stateIds.includes(sId));
    }
    if (!allowed) {
      throw new NotFoundException('Scheme not found or out of scope');
    }

    const year = query.year ?? new Date().getFullYear();
    const quarter = query.quarter ?? Math.floor(new Date().getMonth() / 3) + 1;

    // Cache lookup
    const scopeHash = this.computeScopeHash(scope);
    const filterHash = this.computeFilterHash({ ...query, year, quarter });
    const epoch = (await this.redisService.get('dashboard:cache:epoch')) ?? '0';
    const cacheKey = `dashboard:cache:${epoch}:scheme:${schemeId}:${scopeHash}:${filterHash}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DashboardResponse;
    }

    const sectorFilter = query.sector ?? query.sectorId;
    const seasonFilter = query.season ?? query.seasonId;

    const [farmersRes, areaRes, feeRes, matrixRes, damStatusSummary, childSectors] =
      await Promise.all([
        this.reportRepo.getFarmersByScope(scope, {
          schemeId,
          sectorId: sectorFilter,
        }),
        this.reportRepo.getAreaByService(scope, {
          schemeId,
        }),
        this.reportRepo.getFeeRecovery(scope, {
          schemeId,
          seasonId: seasonFilter,
        }),
        this.indicatorMatrixRepo.getMatrix(
          {
            year,
            quarter,
            scopeType: 'scheme',
            scopeId: schemeId,
          },
          scope,
        ),
        this.blisService.getDamStatusSummary({ schemeId }),
        this.organisationRepo.listOrganisations({
          type: 'sector',
          parentId: schemeId,
          isActive: true,
        }),
      ]);

    const headlineFarmers = this.aggregateFarmers(farmersRes.items);
    const headlineArea = this.aggregateArea(areaRes.items);
    const headlineFee = this.aggregateFeeRecovery(feeRes.items);
    const indicatorProgress = this.aggregateIndicators(matrixRes.items);
    const headlineDamStatus: DashboardDamStatus = {
      meetingStandard: damStatusSummary.meetingStandard,
      notMeetingStandard: damStatusSummary.notMeetingStandard,
      overdue: damStatusSummary.overdue,
      total: damStatusSummary.total,
    };

    const meRefreshedAt = await this.indicatorMatrixRepo.getLastRefreshedAt();
    const lastRefreshedAt = {
      slis: farmersRes.lastRefreshedAt ?? areaRes.lastRefreshedAt ?? feeRes.lastRefreshedAt ?? null,
      me: meRefreshedAt,
      blis: damStatusSummary.lastRefreshedAt,
    };

    // Build children: Sectors in this scheme
    const children: DashboardChildSummary[] = childSectors.map((sec) => {
      const sectorFarmersItems = farmersRes.items.filter((i) => i.sectorId === sec.id);

      return {
        id: sec.id,
        name: sec.name,
        code: sec.code,
        type: 'sector',
        farmers: this.aggregateFarmers(sectorFarmersItems),
        area: {
          totalHa: '0.0000',
          byServiceType: {},
        },
        feeRecovery: {
          billed: '0.00',
          collected: '0.00',
          rate: null,
        },
        indicatorProgress: [],
        damStatus: {
          meetingStandard: 0,
          notMeetingStandard: 0,
          overdue: 0,
          total: 0,
        },
      };
    });

    const response: DashboardResponse = {
      level: 'scheme',
      scopeId: schemeId,
      scopeName: targetScheme.name,
      year,
      quarter,
      farmers: headlineFarmers,
      area: headlineArea,
      feeRecovery: headlineFee,
      indicatorProgress,
      damStatus: headlineDamStatus,
      lastRefreshedAt,
      children,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 60);
    return response;
  }
}
