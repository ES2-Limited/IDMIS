import { sql, type SQL } from '@idmis/db';

/**
 * Converts a GeoJSON object or WKT string into PostGIS SQL expression with SRID 4326.
 */
export function geoJsonToWkt(geom: unknown): string | null {
  if (geom === null || geom === undefined) {
    return null;
  }
  if (typeof geom === 'string') {
    const trimmed = geom.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('{')) {
      try {
        return geoJsonToWkt(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return trimmed;
  }
  if (typeof geom === 'object' && geom !== null) {
    const g = geom as { type?: string; coordinates?: unknown };
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      return `POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
    }
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      const rings = (g.coordinates as number[][][]).map(
        (ring) => `(${ring.map((pt) => `${pt[0]} ${pt[1]}`).join(', ')})`,
      );
      return `POLYGON(${rings.join(', ')})`;
    }
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      const polys = (g.coordinates as number[][][][]).map(
        (poly) =>
          `(${poly
            .map((ring) => `(${ring.map((pt) => `${pt[0]} ${pt[1]}`).join(', ')})`)
            .join(', ')})`,
      );
      return `MULTIPOLYGON(${polys.join(', ')})`;
    }
  }
  return null;
}

export function toGeometrySql(geom: unknown): SQL | null {
  const wkt = geoJsonToWkt(geom);
  if (!wkt) {
    return null;
  }
  return sql`${wkt}::geometry`;
}

/**
 * Parses WKT or GeoJSON string/object into a standard GeoJSON object.
 */
export function wktToGeoJson(wktStr: string): unknown {
  const trimmed = wktStr.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const pointMatch = trimmed.match(/^POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
  if (pointMatch) {
    return {
      type: 'Point',
      coordinates: [parseFloat(pointMatch[1]!), parseFloat(pointMatch[2]!)],
    };
  }

  const multiPolyMatch = trimmed.match(/^MULTIPOLYGON\s*\(\s*\((.*)\)\s*\)/i);
  if (multiPolyMatch) {
    const inner = trimmed
      .replace(/^MULTIPOLYGON\s*\(\s*\(/i, '')
      .replace(/\)\s*\)\s*$/i, '')
      .trim();
    const polyStrings = inner.split(/\)\s*\)\s*,\s*\(\s*\(/);
    const coordinates = polyStrings.map((pStr) => {
      const cleanPStr = pStr.replace(/^\(+/, '').replace(/\)+$/, '');
      const ringStrings = cleanPStr.split(/\)\s*,\s*\(/);
      return ringStrings.map((rStr) => {
        return rStr.split(',').map((coordStr) => {
          const parts = coordStr.trim().split(/\s+/);
          return [parseFloat(parts[0]!), parseFloat(parts[1]!)];
        });
      });
    });
    return {
      type: 'MultiPolygon',
      coordinates,
    };
  }

  const polyMatch = trimmed.match(/^POLYGON\s*\(\s*\((.*)\)\s*\)/i);
  if (polyMatch) {
    const inner = trimmed
      .replace(/^POLYGON\s*\(\s*\(/i, '')
      .replace(/\)\s*\)\s*$/i, '')
      .trim();
    const ringStrings = inner.split(/\)\s*,\s*\(/);
    const coordinates = ringStrings.map((rStr) => {
      const cleanRStr = rStr.replace(/^\(+/, '').replace(/\)+$/, '');
      return cleanRStr.split(',').map((coordStr) => {
        const parts = coordStr.trim().split(/\s+/);
        return [parseFloat(parts[0]!), parseFloat(parts[1]!)];
      });
    });
    return {
      type: 'Polygon',
      coordinates,
    };
  }

  return trimmed;
}

export function parseGeoJsonResult(geom: unknown): unknown {
  if (!geom) return null;
  if (typeof geom === 'object') return geom;
  if (typeof geom === 'string') {
    return wktToGeoJson(geom);
  }
  return geom;
}
