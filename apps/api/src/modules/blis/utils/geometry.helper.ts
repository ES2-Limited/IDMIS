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
    if (/^[0-9A-Fa-f]{10,}$/.test(trimmed)) {
      const parsed = parseWkb(Buffer.from(trimmed, 'hex'));
      if (parsed) {
        return geoJsonToWkt(parsed);
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
  return sql`ST_SetSRID(${wkt}::geometry, 4326)`;
}

/**
 * Parses Well-Known Binary (WKB) buffer (standard PostGIS output) into a GeoJSON object.
 */
export function parseWkb(buffer: Buffer): unknown {
  let offset = 0;

  function readGeometry(): unknown {
    if (offset >= buffer.length) return null;
    const byteOrder = buffer.readUInt8(offset);
    offset += 1;
    const littleEndian = byteOrder === 1;

    let type = littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    offset += 4;

    const hasSrid = (type & 0x20000000) !== 0;
    type = type & 0x1fffffff;
    if (hasSrid) {
      offset += 4; // skip 4-byte SRID
    }

    if (type === 1) {
      // Point
      const x = littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
      offset += 8;
      const y = littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
      offset += 8;
      return {
        type: 'Point',
        coordinates: [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6],
      };
    }

    if (type === 3) {
      // Polygon
      const numRings = littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
      offset += 4;
      const rings: number[][][] = [];
      for (let r = 0; r < numRings; r++) {
        const numPoints = littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
        offset += 4;
        const pts: number[][] = [];
        for (let p = 0; p < numPoints; p++) {
          const x = littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
          offset += 8;
          const y = littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
          offset += 8;
          pts.push([Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
        }
        rings.push(pts);
      }
      return {
        type: 'Polygon',
        coordinates: rings,
      };
    }

    if (type === 6) {
      // MultiPolygon
      const numPolys = littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
      offset += 4;
      const polys: number[][][][] = [];
      for (let i = 0; i < numPolys; i++) {
        const sub = readGeometry() as { type?: string; coordinates?: number[][][] } | null;
        if (sub && sub.coordinates) {
          polys.push(sub.coordinates);
        }
      }
      return {
        type: 'MultiPolygon',
        coordinates: polys,
      };
    }

    return null;
  }

  return readGeometry();
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

  if (/^[0-9A-Fa-f]{10,}$/.test(trimmed)) {
    const wkbParsed = parseWkb(Buffer.from(trimmed, 'hex'));
    if (wkbParsed) return wkbParsed;
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
