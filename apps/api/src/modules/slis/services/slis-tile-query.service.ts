import { Injectable } from '@nestjs/common';
import { db, sql, and, type SQL } from '@idmis/db';
import { permissions } from '@idmis/contracts';
import type { UserAuthz } from '../../../platform/auth';

function sqlUuidArray(ids: string[]): SQL {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
}

export interface SlisTileParams {
  layer: 'plots' | 'schemes' | 'sectors';
  z: number;
  x: number;
  y: number;
  tolerance: number;
  authz: UserAuthz;
}

@Injectable()
export class SlisTileQueryService {
  /**
   * Generates the scoped MVT SQL fragment for SLIS layers (plots, schemes, sectors).
   * Returns null if the user has no access or is outside the layer scope.
   */
  getTileSql(params: SlisTileParams): SQL | null {
    const { layer, z, x, y, tolerance, authz } = params;

    switch (layer.toLowerCase()) {
      case 'plots': {
        const slisScope = authz.scopeFor(permissions.SLIS_PLOT_READ);
        const scopeConditions: SQL[] = [sql`p.deleted_at IS NULL`, sql`p.status = 'approved'`];

        if (!slisScope.isNational) {
          const orConditions: SQL[] = [];
          if (slisScope.schemeIds && slisScope.schemeIds.length > 0) {
            orConditions.push(sql`p.scheme_id = ANY(${sqlUuidArray(slisScope.schemeIds)})`);
          }
          if (slisScope.stateIds && slisScope.stateIds.length > 0) {
            orConditions.push(
              sql`EXISTS (
                SELECT 1 FROM core.organisation_state os
                WHERE os.organisation_id = p.scheme_id
                  AND os.state_id = ANY(${sqlUuidArray(slisScope.stateIds)})
              )`,
            );
          }
          if (orConditions.length === 0) {
            return null; // Scheme or state scope required; out of scope -> 204
          }
          scopeConditions.push(sql`(${sql.join(orConditions, sql` OR `)})`);
        }

        return sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              p.id,
              p.plot_code,
              p.scheme_id,
              p.sector_id,
              p.area_ha,
              p.status,
              ST_AsMVTGeom(
                ST_Simplify(ST_Transform(p.geom, 3857), ${tolerance}),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM slis.plot p
            CROSS JOIN tile_bounds tb
            WHERE ${and(...scopeConditions)}
              AND p.geom IS NOT NULL
              AND ST_Intersects(ST_Transform(p.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'plots', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
      }

      case 'schemes': {
        const coreScope = authz.can(permissions.CORE_ORGANISATION_READ)
          ? authz.scopeFor(permissions.CORE_ORGANISATION_READ)
          : authz.scopeFor(permissions.SLIS_PLOT_READ);
        const scopeConditions: SQL[] = [sql`o.type = 'scheme'`, sql`o.deleted_at IS NULL`];

        if (!coreScope.isNational) {
          const orConditions: SQL[] = [];
          if (coreScope.schemeIds && coreScope.schemeIds.length > 0) {
            orConditions.push(sql`o.id = ANY(${sqlUuidArray(coreScope.schemeIds)})`);
          }
          if (coreScope.stateIds && coreScope.stateIds.length > 0) {
            orConditions.push(
              sql`EXISTS (
                SELECT 1 FROM core.organisation_state os
                WHERE os.organisation_id = o.id
                  AND os.state_id = ANY(${sqlUuidArray(coreScope.stateIds)})
              )`,
            );
          }
          if (orConditions.length === 0) {
            return null;
          }
          scopeConditions.push(sql`(${sql.join(orConditions, sql` OR `)})`);
        }

        return sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              o.id,
              o.code,
              o.name,
              o.irrigable_area_ha,
              ST_AsMVTGeom(
                ST_Simplify(ST_Transform(o.geom, 3857), ${tolerance}),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM core.organisation o
            CROSS JOIN tile_bounds tb
            WHERE ${and(...scopeConditions)}
              AND o.geom IS NOT NULL
              AND ST_Intersects(ST_Transform(o.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'schemes', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
      }

      case 'sectors': {
        const coreScope = authz.can(permissions.CORE_ORGANISATION_READ)
          ? authz.scopeFor(permissions.CORE_ORGANISATION_READ)
          : authz.scopeFor(permissions.SLIS_PLOT_READ);
        const scopeConditions: SQL[] = [sql`o.type = 'sector'`, sql`o.deleted_at IS NULL`];

        if (!coreScope.isNational) {
          const orConditions: SQL[] = [];
          if (coreScope.schemeIds && coreScope.schemeIds.length > 0) {
            orConditions.push(sql`o.parent_id = ANY(${sqlUuidArray(coreScope.schemeIds)})`);
          }
          if (coreScope.stateIds && coreScope.stateIds.length > 0) {
            orConditions.push(
              sql`EXISTS (
                SELECT 1 FROM core.organisation_state os
                WHERE os.organisation_id = o.parent_id
                  AND os.state_id = ANY(${sqlUuidArray(coreScope.stateIds)})
              )`,
            );
          }
          if (coreScope.sectorIds && coreScope.sectorIds.length > 0) {
            orConditions.push(sql`o.id = ANY(${sqlUuidArray(coreScope.sectorIds)})`);
          }
          if (orConditions.length === 0) {
            return null;
          }
          scopeConditions.push(sql`(${sql.join(orConditions, sql` OR `)})`);
        }

        return sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              o.id,
              o.code,
              o.name,
              o.parent_id AS scheme_id,
              ST_AsMVTGeom(
                ST_Simplify(ST_Transform(o.geom, 3857), ${tolerance}),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM core.organisation o
            CROSS JOIN tile_bounds tb
            WHERE ${and(...scopeConditions)}
              AND o.geom IS NOT NULL
              AND ST_Intersects(ST_Transform(o.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'sectors', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
      }

      default:
        return null;
    }
  }

  /**
   * Helper that executes the tile query and returns the vector tile Buffer, or null if empty.
   */
  async getVectorTile(params: SlisTileParams): Promise<Buffer | null> {
    const tileSql = this.getTileSql(params);
    if (!tileSql) {
      return null;
    }

    const res = await db.execute(tileSql);
    const row = res[0] as { mvt: Buffer | string | null } | undefined;
    if (!row || !row.mvt) {
      return null;
    }

    const mvtBuffer = Buffer.isBuffer(row.mvt) ? row.mvt : Buffer.from(row.mvt);
    return mvtBuffer.length > 0 ? mvtBuffer : null;
  }
}
