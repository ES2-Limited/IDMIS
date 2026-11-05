import { sql, type SQL } from '@idmis/db';
import { BadRequestException } from '@nestjs/common';

export type GeometryColumnType = 'Point' | 'MultiPolygon';

export interface ValidateGeometryOptions {
  isStation?: boolean;
}

/**
 * Validates GeoJSON input and builds PostGIS SQL expression:
 * ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))
 * Wrapping with ST_Multi for MultiPolygon columns.
 *
 * Rejects invalid GeoJSON, empty geometries, wrong geometry type,
 * or station coordinates outside the Nigeria bounding box (lon: 2.5-15.0, lat: 4.0-14.0) with 400.
 */
export function validateAndBuildGeometrySql(
  geom: unknown,
  expectedType: GeometryColumnType,
  options?: ValidateGeometryOptions,
): SQL | null {
  if (geom === null || geom === undefined) {
    return null;
  }

  let geomObj: Record<string, unknown>;
  if (typeof geom === 'string') {
    const trimmed = geom.trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid GeoJSON: geometry cannot be empty');
    }
    try {
      geomObj = JSON.parse(trimmed);
    } catch {
      throw new BadRequestException('Invalid GeoJSON: must be a valid JSON object');
    }
  } else if (typeof geom === 'object' && geom !== null) {
    geomObj = geom as Record<string, unknown>;
  } else {
    throw new BadRequestException('Invalid GeoJSON: must be a GeoJSON object');
  }

  if (typeof geomObj.type !== 'string' || !geomObj.type) {
    throw new BadRequestException('Invalid GeoJSON: missing or invalid "type" property');
  }

  const type = geomObj.type;

  if (!('coordinates' in geomObj) || !Array.isArray(geomObj.coordinates)) {
    throw new BadRequestException('Invalid GeoJSON: missing or invalid "coordinates" array');
  }

  const coords = geomObj.coordinates;
  if (coords.length === 0) {
    throw new BadRequestException('Invalid GeoJSON: geometry coordinates cannot be empty');
  }

  if (expectedType === 'Point') {
    if (type !== 'Point') {
      throw new BadRequestException(`Invalid geometry type: expected Point, got ${type}`);
    }

    if (
      coords.length < 2 ||
      typeof coords[0] !== 'number' ||
      typeof coords[1] !== 'number' ||
      isNaN(coords[0]) ||
      isNaN(coords[1])
    ) {
      throw new BadRequestException(
        'Invalid GeoJSON: Point coordinates must be [longitude, latitude] numbers',
      );
    }

    const lon = coords[0];
    const lat = coords[1];

    if (options?.isStation) {
      if (lon < 2.5 || lon > 15.0 || lat < 4.0 || lat > 14.0) {
        throw new BadRequestException(
          `Station coordinates must be within Nigeria bounding box (lon: 2.5–15.0, lat: 4.0–14.0). Got lon: ${lon}, lat: ${lat}`,
        );
      }
    }

    const jsonStr = JSON.stringify(geomObj);
    return sql`ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${jsonStr}), 4326))`;
  }

  if (expectedType === 'MultiPolygon') {
    if (type !== 'Polygon' && type !== 'MultiPolygon') {
      throw new BadRequestException(
        `Invalid geometry type: expected Polygon or MultiPolygon, got ${type}`,
      );
    }

    if (type === 'Polygon') {
      const rings = coords as unknown[];
      if (rings.length === 0 || !Array.isArray(rings[0]) || rings[0].length === 0) {
        throw new BadRequestException('Invalid GeoJSON: Polygon rings cannot be empty');
      }
    } else if (type === 'MultiPolygon') {
      const polys = coords as unknown[];
      if (polys.length === 0 || !Array.isArray(polys[0]) || polys[0].length === 0) {
        throw new BadRequestException('Invalid GeoJSON: MultiPolygon polygons cannot be empty');
      }
    }

    const jsonStr = JSON.stringify(geomObj);
    return sql`ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${jsonStr}), 4326)))`;
  }

  throw new BadRequestException(`Unsupported expected geometry type: ${expectedType}`);
}

/**
 * Backward compatibility alias for repository calls.
 */
export function toGeometrySql(
  geom: unknown,
  expectedType: GeometryColumnType = 'MultiPolygon',
  options?: ValidateGeometryOptions,
): SQL | null {
  return validateAndBuildGeometrySql(geom, expectedType, options);
}
