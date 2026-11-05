import { Injectable } from '@nestjs/common';
import { db, dam, damSafetyInspection, station, eq, and, isNull, sql, type SQL } from '@idmis/db';

export interface BlisScopeParams {
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
}

@Injectable()
export class BlisComputeQueryService {
  /**
   * Indicator 5: Dams meeting international safety standards (blis.dams_safe).
   * Count of dams whose latest approved inspection on or before period end meets standard.
   */
  async getDamsSafe(periodEnd: string, scope: BlisScopeParams): Promise<{ total: string }> {
    if (scope.scopeType === 'scheme' || scope.scopeType === 'sector') {
      return { total: '0' };
    }

    const periodEndEod = `${periodEnd}T23:59:59.999Z`;

    const scopeConditions: SQL[] = [isNull(dam.deletedAt)];

    if (scope.scopeType === 'state') {
      if (!scope.scopeStateId) {
        throw new Error('Scope type state requires scopeStateId');
      }
      scopeConditions.push(
        sql`EXISTS (
          SELECT 1 FROM core.lga l
          WHERE l.id = ${dam.lgaId}
            AND l.state_id = ${scope.scopeStateId}::uuid
        )`,
      );
    } else if (scope.scopeType === 'rbda') {
      if (!scope.scopeOrgId) {
        throw new Error('Scope type rbda requires scopeOrgId');
      }
      scopeConditions.push(
        sql`EXISTS (
          SELECT 1 FROM blis.basin b
          WHERE b.id = ${dam.basinId}
            AND b.rbda_id = ${scope.scopeOrgId}::uuid
            AND b.deleted_at IS NULL
        )`,
      );
    }

    // Subquery: latest approved inspection per dam up to period end
    const latestInspectionSubquery = db
      .selectDistinctOn([damSafetyInspection.damId], {
        damId: damSafetyInspection.damId,
        meetsStandard: damSafetyInspection.meetsStandard,
      })
      .from(damSafetyInspection)
      .where(
        and(
          eq(damSafetyInspection.status, 'approved'),
          isNull(damSafetyInspection.deletedAt),
          sql`${damSafetyInspection.inspectedOn} <= ${periodEnd}::date`,
          sql`${damSafetyInspection.approvedAt} <= ${periodEndEod}::timestamptz`,
        ),
      )
      .orderBy(
        damSafetyInspection.damId,
        sql`${damSafetyInspection.inspectedOn} DESC`,
        sql`${damSafetyInspection.approvedAt} DESC`,
        sql`${damSafetyInspection.createdAt} DESC`,
      )
      .as('latest_insp');

    const [row] = await db
      .select({
        count: sql<number>`count(distinct ${dam.id})::int`,
      })
      .from(dam)
      .innerJoin(latestInspectionSubquery, eq(latestInspectionSubquery.damId, dam.id))
      .where(and(...scopeConditions, eq(latestInspectionSubquery.meetsStandard, true)));

    return { total: String(row?.count ?? 0) };
  }

  /**
   * Indicator 7: Rivers with discharge gauging stations (blis.rivers_gauged).
   * Distinct lower(trim(river)) of active stations of type 'discharge' installed on or before period end.
   */
  async getRiversGauged(periodEnd: string, scope: BlisScopeParams): Promise<{ total: string }> {
    if (scope.scopeType === 'scheme' || scope.scopeType === 'sector') {
      return { total: '0' };
    }

    const scopeConditions: SQL[] = [
      isNull(station.deletedAt),
      sql`${station.river} IS NOT NULL`,
      sql`trim(${station.river}) != ''`,
      sql`${station.installedOn} <= ${periodEnd}::date`,
      eq(station.isActive, true),
      sql`EXISTS (
        SELECT 1 FROM core.lookup_value lv
        WHERE lv.id = ${station.stationTypeId}
          AND lv.code = 'discharge'
      )`,
    ];

    if (scope.scopeType === 'state') {
      if (!scope.scopeStateId) {
        throw new Error('Scope type state requires scopeStateId');
      }
      scopeConditions.push(
        sql`EXISTS (
          SELECT 1 FROM core.ward w
          JOIN core.lga l ON l.id = w.lga_id
          WHERE w.id = ${station.wardId}
            AND l.state_id = ${scope.scopeStateId}::uuid
        )`,
      );
    } else if (scope.scopeType === 'rbda') {
      if (!scope.scopeOrgId) {
        throw new Error('Scope type rbda requires scopeOrgId');
      }
      scopeConditions.push(
        sql`EXISTS (
          SELECT 1 FROM blis.basin b
          WHERE b.id = ${station.basinId}
            AND b.rbda_id = ${scope.scopeOrgId}::uuid
            AND b.deleted_at IS NULL
        )`,
      );
    }

    const [row] = await db
      .select({
        count: sql<number>`count(distinct lower(trim(${station.river})))::int`,
      })
      .from(station)
      .where(and(...scopeConditions));

    return { total: String(row?.count ?? 0) };
  }
}
