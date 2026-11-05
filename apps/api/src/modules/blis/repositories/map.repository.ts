import { Injectable, Logger } from '@nestjs/common';
import {
  db,
  mapLayer,
  station,
  dam,
  basin,
  organisation,
  plot,
  eq,
  and,
  isNull,
  sql,
  type SQL,
} from '@idmis/db';
import type { UserAuthz } from '../../../platform/auth';

type DatabaseOrTx = typeof db;

export interface TileQueryParam {
  layer: string;
  z: number;
  x: number;
  y: number;
  authz: UserAuthz;
}

@Injectable()
export class MapRepository {
  private readonly logger = new Logger(MapRepository.name);

  /**
   * Generates a Mapbox Vector Tile (.mvt) for a given layer and tile coordinate.
   * Returns a Buffer with MVT binary data, or null if empty.
   */
  async getVectorTile(params: TileQueryParam, txDb: DatabaseOrTx = db): Promise<Buffer | null> {
    const { layer, z, x, y, authz } = params;

    // Tolerance for geometry simplification based on zoom level (in meters in Web Mercator EPSG:3857)
    // Resolution at equator roughly: 40075016.68557849 / (256 * 2^z)
    const tolerance = 40075016.68557849 / (4096 * Math.pow(2, z));

    let tileSql: SQL;

    switch (layer.toLowerCase()) {
      case 'stations': {
        const blisScope =
          authz.scopeFor('blis.measurement:read') || authz.scopeFor('blis.basin:read');
        const scopeConditions: SQL[] = [isNull(station.deletedAt)];

        if (!blisScope.isNational) {
          if (blisScope.rbdaIds && blisScope.rbdaIds.length > 0) {
            scopeConditions.push(
              sql`EXISTS (
                SELECT 1 FROM blis.basin b
                WHERE b.id = ${station.basinId}
                  AND b.rbda_id = ANY(${blisScope.rbdaIds}::uuid[])
                  AND b.deleted_at IS NULL
              )`,
            );
          } else {
            return null; // Deny by default if out of scope
          }
        }

        tileSql = sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              s.id,
              s.code,
              s.name,
              s.basin_id,
              s.river,
              s.is_active,
              ST_AsMVTGeom(
                ST_Transform(s.geom, 3857),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM blis.station s
            CROSS JOIN tile_bounds tb
            WHERE ${and(...scopeConditions)}
              AND ST_Intersects(ST_Transform(s.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'stations', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
        break;
      }

      case 'dams': {
        const blisScope = authz.scopeFor('blis.dam:manage') || authz.scopeFor('blis.basin:read');
        const scopeConditions: SQL[] = [isNull(dam.deletedAt)];

        if (!blisScope.isNational) {
          if (blisScope.rbdaIds && blisScope.rbdaIds.length > 0) {
            scopeConditions.push(
              sql`EXISTS (
                SELECT 1 FROM blis.basin b
                WHERE b.id = ${dam.basinId}
                  AND b.rbda_id = ANY(${blisScope.rbdaIds}::uuid[])
                  AND b.deleted_at IS NULL
              )`,
            );
          } else {
            return null;
          }
        }

        tileSql = sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              d.id,
              d.code,
              d.name,
              d.basin_id,
              d.completion_year,
              d.height_m,
              d.reservoir_capacity_mcm,
              st.meets_standard,
              COALESCE(st.next_due_on < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date, false) AS is_overdue,
              ST_AsMVTGeom(
                ST_Transform(d.geom, 3857),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM blis.dam d
            LEFT JOIN blis.mv_dam_status st ON st.dam_id = d.id
            CROSS JOIN tile_bounds tb
            WHERE ${and(...scopeConditions)}
              AND ST_Intersects(ST_Transform(d.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'dams', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
        break;
      }

      case 'basins': {
        const blisScope = authz.scopeFor('blis.basin:read');
        const scopeConditions: SQL[] = [isNull(basin.deletedAt)];

        if (!blisScope.isNational) {
          if (blisScope.rbdaIds && blisScope.rbdaIds.length > 0) {
            scopeConditions.push(sql`b.rbda_id = ANY(${blisScope.rbdaIds}::uuid[])`);
          } else {
            return null;
          }
        }

        // Basins do not have geom directly on basin table, but if custom layers or boundaries exist
        // Return empty or query map_layer
        return null;
      }

      case 'plots': {
        const slisScope = authz.scopeFor('slis.plot:read');
        const scopeConditions: SQL[] = [isNull(plot.deletedAt)];

        if (!slisScope.isNational) {
          if (slisScope.schemeIds && slisScope.schemeIds.length > 0) {
            scopeConditions.push(sql`p.scheme_id = ANY(${slisScope.schemeIds}::uuid[])`);
          } else {
            return null;
          }
        }

        // Zero PII: only id, plot_code, scheme_id, sector_id, area_ha, is_active
        tileSql = sql`
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
              p.is_active,
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
              AND ST_Intersects(ST_Transform(p.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, 'plots', 4096, 'geom') AS mvt FROM mvt_geom;
        `;
        break;
      }

      case 'schemes': {
        const coreScope =
          authz.scopeFor('core.organisation:read') || authz.scopeFor('slis.plot:read');
        const scopeConditions: SQL[] = [
          eq(organisation.type, 'scheme'),
          isNull(organisation.deletedAt),
        ];

        if (!coreScope.isNational) {
          if (coreScope.schemeIds && coreScope.schemeIds.length > 0) {
            scopeConditions.push(sql`o.id = ANY(${coreScope.schemeIds}::uuid[])`);
          } else if (coreScope.stateIds && coreScope.stateIds.length > 0) {
            scopeConditions.push(
              sql`EXISTS (
                SELECT 1 FROM core.organisation_state os
                WHERE os.organisation_id = o.id
                  AND os.state_id = ANY(${coreScope.stateIds}::uuid[])
              )`,
            );
          } else {
            return null;
          }
        }

        tileSql = sql`
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
        break;
      }

      default: {
        // Custom map layer by ID or Name
        const [layerRow] = await txDb
          .select({
            id: mapLayer.id,
            name: mapLayer.name,
            basinId: mapLayer.basinId,
          })
          .from(mapLayer)
          .where(
            and(
              isNull(mapLayer.deletedAt),
              sql`${mapLayer.id}::text = ${layer} OR LOWER(${mapLayer.name}) = LOWER(${layer})`,
            ),
          )
          .limit(1);

        if (!layerRow) {
          return null;
        }

        // Scope check for custom layer: if basinId is present, must be in user's BLIS scope
        if (layerRow.basinId) {
          const blisScope = authz.scopeFor('blis.map:read') || authz.scopeFor('blis.basin:read');
          if (!blisScope.isNational) {
            if (blisScope.rbdaIds && blisScope.rbdaIds.length > 0) {
              const [basinMatch] = await txDb
                .select({ id: basin.id })
                .from(basin)
                .where(
                  and(
                    eq(basin.id, layerRow.basinId),
                    sql`${basin.rbdaId} = ANY(${blisScope.rbdaIds}::uuid[])`,
                    isNull(basin.deletedAt),
                  ),
                )
                .limit(1);
              if (!basinMatch) {
                return null;
              }
            } else {
              return null;
            }
          }
        }

        tileSql = sql`
          WITH tile_bounds AS (
            SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS env
          ),
          mvt_geom AS (
            SELECT
              f.id,
              f.properties - 'nin' - 'bvn' - 'phone' - 'email' - 'farmer_name' AS properties,
              ST_AsMVTGeom(
                ST_Simplify(ST_Transform(f.geom, 3857), ${tolerance}),
                tb.env,
                4096,
                256,
                true
              ) AS geom
            FROM blis.map_feature f
            CROSS JOIN tile_bounds tb
            WHERE f.layer_id = ${layerRow.id}
              AND ST_Intersects(ST_Transform(f.geom, 3857), tb.env)
          )
          SELECT ST_AsMVT(mvt_geom.*, ${layerRow.name}, 4096, 'geom') AS mvt FROM mvt_geom;
        `;
        break;
      }
    }

    const res = await txDb.execute(tileSql);
    const row = res[0] as { mvt: Buffer | string | null } | undefined;

    if (!row || !row.mvt) {
      return null;
    }

    const mvtBuffer = Buffer.isBuffer(row.mvt) ? row.mvt : Buffer.from(row.mvt);
    return mvtBuffer.length > 0 ? mvtBuffer : null;
  }
}
