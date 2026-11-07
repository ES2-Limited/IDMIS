import { Injectable, Logger } from '@nestjs/common';
import {
  db,
  station,
  mvLatestReading,
  mvDamStatus,
  basin,
  dam,
  reservoir,
  eq,
  and,
  isNull,
  count,
  sql,
} from '@idmis/db';
import type {
  StationLookup,
  StationValidationResult,
  LatestReadingSummary,
  DamSafetyStatus,
  BasinSummary,
} from '@idmis/contracts';
import { StationRepository } from '../repositories/station.repository';
import { BlisComputeQueryService, type BlisScopeParams } from './blis-compute-query.service';

@Injectable()
export class BlisPublicService {
  private readonly logger = new Logger(BlisPublicService.name);

  constructor(
    private readonly stationRepo: StationRepository,
    private readonly computeQueryService: BlisComputeQueryService,
  ) {}

  /**
   * Station lookup returning metadata, active status, and PostGIS GeoJSON geometry.
   */
  async lookupStation(stationId: string): Promise<StationLookup | null> {
    if (!stationId || stationId === '00000000-0000-0000-0000-000000000000') {
      return null;
    }
    const row = await this.stationRepo.findById(stationId);
    if (!row) {
      return null;
    }

    let location: unknown = row.geom;
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch {
        // Keep as is if parsing fails
      }
    }

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: Boolean(row.isActive),
      location,
      basinId: row.basinId,
      stationTypeId: row.stationTypeId,
      wardId: row.wardId,
      river: row.river,
    };
  }

  /**
   * Validates station existence and active status.
   */
  async validateStation(stationId: string): Promise<StationValidationResult> {
    const st = await this.lookupStation(stationId);
    if (!st) {
      return { valid: false, reason: 'not_found' };
    }
    if (!st.isActive) {
      return { valid: false, reason: 'inactive', station: st };
    }
    return { valid: true, station: st };
  }

  /**
   * Backward-compatible check for legacy callers.
   */
  async stationExists(stationId: string): Promise<boolean> {
    const res = await this.validateStation(stationId);
    return res.valid;
  }

  /**
   * Returns latest readings per parameter for a station from blis.mv_latest_reading.
   */
  async getLatestReadings(stationId: string): Promise<LatestReadingSummary[]> {
    if (!stationId) return [];

    const rows = await db
      .select({
        stationId: mvLatestReading.stationId,
        parameterId: mvLatestReading.parameterId,
        observedAt: mvLatestReading.observedAt,
        value: mvLatestReading.value,
        unit: mvLatestReading.unit,
        quality: mvLatestReading.quality,
      })
      .from(mvLatestReading)
      .where(eq(mvLatestReading.stationId, stationId));

    return rows.map((r) => ({
      stationId: r.stationId,
      parameterId: r.parameterId,
      observedAt:
        typeof r.observedAt === 'string' ? r.observedAt : (r.observedAt as Date).toISOString(),
      value: String(r.value),
      unit: r.unit,
      quality: r.quality,
    }));
  }

  /**
   * Returns the latest approved dam safety inspection status from blis.mv_dam_status.
   */
  async getDamSafetyStatus(damId: string): Promise<DamSafetyStatus | null> {
    if (!damId) return null;

    const [row] = await db
      .select({
        damId: mvDamStatus.damId,
        inspectionId: mvDamStatus.inspectionId,
        inspectedOn: mvDamStatus.inspectedOn,
        meetsStandard: mvDamStatus.meetsStandard,
        hazardClassId: mvDamStatus.hazardClassId,
        hazardClass: mvDamStatus.hazardClass,
        nextDueOn: mvDamStatus.nextDueOn,
        isOverdue: sql<boolean>`COALESCE(${mvDamStatus.nextDueOn} < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date, false)`,
        approvedAt: mvDamStatus.approvedAt,
      })
      .from(mvDamStatus)
      .where(eq(mvDamStatus.damId, damId))
      .limit(1);

    if (!row) return null;

    return {
      damId: row.damId,
      inspectionId: row.inspectionId,
      inspectedOn: String(row.inspectedOn),
      meetsStandard: Boolean(row.meetsStandard),
      hazardClassId: row.hazardClassId,
      hazardClass: row.hazardClass,
      nextDueOn: row.nextDueOn ? String(row.nextDueOn) : null,
      isOverdue: Boolean(row.isOverdue),
      approvedAt:
        typeof row.approvedAt === 'string'
          ? row.approvedAt
          : (row.approvedAt as Date).toISOString(),
    };
  }

  /**
   * Returns basin summary with counts of stations, dams, and reservoirs.
   */
  async getBasinSummary(basinId: string): Promise<BasinSummary | null> {
    if (!basinId) return null;

    const [b] = await db
      .select({
        id: basin.id,
        code: basin.code,
        name: basin.name,
        rbdaId: basin.rbdaId,
      })
      .from(basin)
      .where(and(eq(basin.id, basinId), isNull(basin.deletedAt)))
      .limit(1);

    if (!b) return null;

    const [[stationRes], [damRes], [resRes]] = await Promise.all([
      db
        .select({ count: count() })
        .from(station)
        .where(and(eq(station.basinId, basinId), isNull(station.deletedAt))),
      db
        .select({ count: count() })
        .from(dam)
        .where(and(eq(dam.basinId, basinId), isNull(dam.deletedAt))),
      db
        .select({ count: count() })
        .from(reservoir)
        .where(and(eq(reservoir.basinId, basinId), isNull(reservoir.deletedAt))),
    ]);

    return {
      id: b.id,
      code: b.code,
      name: b.name,
      rbdaId: b.rbdaId,
      stationCount: Number(stationRes?.count ?? 0),
      damCount: Number(damRes?.count ?? 0),
      reservoirCount: Number(resRes?.count ?? 0),
    };
  }

  /**
   * Public proxy for M&E Indicator 7 (rivers gauged).
   */
  async getRiversGaugedCount(periodEnd: string, scope: BlisScopeParams): Promise<string | null> {
    const res = await this.computeQueryService.getRiversGauged(periodEnd, scope);
    return res.total;
  }

  /**
   * Public proxy for M&E Indicator 5 (dams meeting safety standards).
   */
  async getDamsMeetingStandardCount(
    periodEnd: string,
    scope: BlisScopeParams,
  ): Promise<string | null> {
    const res = await this.computeQueryService.getDamsSafe(periodEnd, scope);
    return res.total;
  }
}
