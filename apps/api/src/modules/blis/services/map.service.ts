import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import { db, mapLayer, basin, eq, and, isNull, sql } from '@idmis/db';
import type { UserAuthz } from '../../../platform/auth';
import { MapRepository } from '../repositories/map.repository';
import { extractAndValidateShapefileZip } from '../utils/shapefile.helper';
import { runInTransaction } from '../../../platform/database/transaction.helper';

export interface UploadGeoJsonInput {
  name: string;
  layerTypeId: string;
  basinId?: string;
  details?: string;
  sourceSrid?: number;
  geojson: Record<string, unknown>;
}

export interface UploadShapefileInput {
  name: string;
  layerTypeId: string;
  basinId?: string;
  details?: string;
  sourceSrid?: number;
  fileId?: string;
  zipBase64?: string;
}

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(private readonly mapRepo: MapRepository) {}

  /**
   * Uploads and parses GeoJSON into map_layer and map_feature records.
   */
  async uploadGeoJson(input: UploadGeoJsonInput, authz: UserAuthz, userId: string) {
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('Layer name is required');
    }

    if (input.basinId) {
      const blisScope = authz.scopeFor('blis.map:manage') || authz.scopeFor('blis.basin:manage');
      if (!blisScope.isNational && (!blisScope.rbdaIds || !blisScope.rbdaIds.length)) {
        throw new BadRequestException('Basin is outside your authorized scope');
      }
      if (!blisScope.isNational) {
        const [b] = await db
          .select({ id: basin.id })
          .from(basin)
          .where(
            and(
              eq(basin.id, input.basinId),
              sql`${basin.rbdaId} = ANY(${blisScope.rbdaIds}::uuid[])`,
              isNull(basin.deletedAt),
            ),
          )
          .limit(1);
        if (!b) {
          throw new BadRequestException('Basin is outside your authorized RBDA scope');
        }
      }
    }

    const geojson = input.geojson;
    if (!geojson || typeof geojson !== 'object') {
      throw new BadRequestException('Invalid GeoJSON object');
    }

    let features: Array<{ properties: Record<string, unknown>; geometry: unknown }> = [];

    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      features = geojson.features.map((f: unknown) => {
        if (!f || typeof f !== 'object') {
          throw new BadRequestException('FeatureCollection contains invalid feature');
        }
        const feat = f as { properties?: Record<string, unknown>; geometry?: unknown };
        if (!feat.geometry) {
          throw new BadRequestException('Feature missing geometry');
        }
        return {
          properties: feat.properties || {},
          geometry: feat.geometry,
        };
      });
    } else if (geojson.type === 'Feature' && geojson.geometry) {
      features = [
        {
          properties: (geojson.properties as Record<string, unknown>) || {},
          geometry: geojson.geometry,
        },
      ];
    } else {
      throw new BadRequestException('GeoJSON must be a Feature or FeatureCollection');
    }

    if (features.length === 0) {
      throw new BadRequestException('GeoJSON contains no features');
    }

    // Validate coordinates bounds
    const srid = input.sourceSrid || 4326;
    if (srid === 4326) {
      for (const feat of features) {
        this.validateNigeriaCoordinates(feat.geometry);
      }
    }

    const layerId = crypto.randomUUID();
    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        await tx.insert(mapLayer).values({
          id: layerId,
          name: input.name.trim(),
          layerTypeId: input.layerTypeId,
          basinId: input.basinId || null,
          sourceSrid: srid,
          details: input.details || null,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        });

        for (const feat of features) {
          const featureId = crypto.randomUUID();
          const geomJson = JSON.stringify(feat.geometry);

          if (srid === 4326) {
            await tx.execute(sql`
            INSERT INTO blis.map_feature (id, layer_id, properties, geom)
            VALUES (
              ${featureId}::uuid,
              ${layerId}::uuid,
              ${JSON.stringify(feat.properties)}::jsonb,
              ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))
            )
          `);
          } else {
            await tx.execute(sql`
            INSERT INTO blis.map_feature (id, layer_id, properties, geom)
            VALUES (
              ${featureId}::uuid,
              ${layerId}::uuid,
              ${JSON.stringify(feat.properties)}::jsonb,
              ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), ${srid}), 4326))
            )
          `);
          }
        }

        // Compute total area in km2
        const [areaRes] = await tx.execute(sql`
        SELECT ROUND((COALESCE(SUM(ST_Area(geom::geography)), 0) / 1000000.0)::numeric, 3)::text AS area_km2
        FROM blis.map_feature
        WHERE layer_id = ${layerId}::uuid;
      `);

        const areaKm2 = (areaRes as { area_km2?: string })?.area_km2 || '0.000';
        await tx
          .update(mapLayer)
          .set({ areaKm2, updatedAt: new Date().toISOString() })
          .where(eq(mapLayer.id, layerId));

        return {
          id: layerId,
          name: input.name,
          featureCount: features.length,
          areaKm2,
          sourceSrid: srid,
        };
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.map_layer',
          actorUserId: userId,
        },
      },
    );
  }

  /**
   * Uploads and parses zipped Shapefile (.shp, .shx, .dbf, .prj) into map_layer and map_feature records.
   */
  async uploadShapefile(input: UploadShapefileInput, authz: UserAuthz, userId: string) {
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('Layer name is required');
    }

    if (!input.zipBase64 && !input.fileId) {
      throw new BadRequestException('Either zipBase64 or fileId must be provided');
    }

    const zipBuffer = input.zipBase64 ? Buffer.from(input.zipBase64, 'base64') : Buffer.alloc(0);

    const extracted = extractAndValidateShapefileZip(zipBuffer);
    const sourceSrid = input.sourceSrid || extracted.sourceSrid || 4326;

    if (sourceSrid === 4326) {
      for (const feat of extracted.features) {
        this.validateNigeriaCoordinates(feat.geometry);
      }
    }

    const layerId = crypto.randomUUID();
    const now = new Date().toISOString();

    return runInTransaction(
      async (tx) => {
        await tx.insert(mapLayer).values({
          id: layerId,
          name: input.name.trim(),
          layerTypeId: input.layerTypeId,
          basinId: input.basinId || null,
          sourceSrid,
          details: input.details || null,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        });

        for (const feat of extracted.features) {
          const featureId = crypto.randomUUID();
          const geomJson = JSON.stringify(feat.geometry);

          if (sourceSrid === 4326) {
            await tx.execute(sql`
            INSERT INTO blis.map_feature (id, layer_id, properties, geom)
            VALUES (
              ${featureId}::uuid,
              ${layerId}::uuid,
              ${JSON.stringify(feat.properties)}::jsonb,
              ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))
            )
          `);
          } else {
            await tx.execute(sql`
            INSERT INTO blis.map_feature (id, layer_id, properties, geom)
            VALUES (
              ${featureId}::uuid,
              ${layerId}::uuid,
              ${JSON.stringify(feat.properties)}::jsonb,
              ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), ${sourceSrid}), 4326))
            )
          `);
          }
        }

        // Compute total area in km2
        const [areaRes] = await tx.execute(sql`
        SELECT ROUND((COALESCE(SUM(ST_Area(geom::geography)), 0) / 1000000.0)::numeric, 3)::text AS area_km2
        FROM blis.map_feature
        WHERE layer_id = ${layerId}::uuid;
      `);

        const areaKm2 = (areaRes as { area_km2?: string })?.area_km2 || '0.000';
        await tx
          .update(mapLayer)
          .set({ areaKm2, updatedAt: new Date().toISOString() })
          .where(eq(mapLayer.id, layerId));

        return {
          id: layerId,
          name: input.name,
          featureCount: extracted.features.length,
          areaKm2,
          sourceSrid,
        };
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.map_layer',
          actorUserId: userId,
        },
      },
    );
  }

  /**
   * Generates vector tile. Returns raw buffer or null if empty.
   */
  async getVectorTile(
    layer: string,
    zStr: string,
    xStr: string,
    yStr: string,
    authz: UserAuthz,
  ): Promise<Buffer | null> {
    const z = parseInt(zStr, 10);
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    if (Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
      throw new BadRequestException('Tile coordinates z, x, and y must be integers');
    }

    if (z < 0 || z > 18) {
      throw new BadRequestException('Zoom level z must be between 0 and 18');
    }

    const maxCoord = Math.pow(2, z) - 1;
    if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) {
      throw new BadRequestException(
        `Tile coordinates out of bounds for zoom ${z}: x and y must be 0..${maxCoord}`,
      );
    }

    return this.mapRepo.getVectorTile({ layer, z, x, y, authz });
  }

  /**
   * Validates that coordinates in EPSG:4326 fall within Nigeria bounding box:
   * lon: [2.5, 15.0], lat: [4.0, 14.0].
   */
  private validateNigeriaCoordinates(geom: unknown): void {
    if (!geom || typeof geom !== 'object') return;
    const g = geom as { type?: string; coordinates?: unknown };

    const coords = this.flattenCoordinates(g.coordinates);
    if (coords.length === 0) return;

    // Check if any point is within Nigeria bounding box
    const hasNigeriaPoint = coords.some(
      ([lon, lat]) => lon >= 2.5 && lon <= 15.0 && lat >= 4.0 && lat <= 14.0,
    );

    if (!hasNigeriaPoint) {
      throw new BadRequestException(
        'Coordinates out of Nigeria bounding box: lon must be between 2.5 and 15.0, lat between 4.0 and 14.0',
      );
    }
  }

  private flattenCoordinates(coords: unknown): Array<[number, number]> {
    if (!Array.isArray(coords)) return [];
    const result: Array<[number, number]> = [];

    function recurse(arr: unknown[]) {
      if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        result.push([arr[0], arr[1]]);
      } else {
        for (const item of arr) {
          if (Array.isArray(item)) recurse(item);
        }
      }
    }

    recurse(coords);
    return result;
  }
}
