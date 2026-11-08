export function parseWktToGeoJson(wktStr: string): Record<string, unknown> | null {
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
      return rStr.split(',').map((coordStr) => {
        const parts = coordStr.trim().split(/\s+/);
        return [parseFloat(parts[0]!), parseFloat(parts[1]!)];
      });
    });
    return {
      type: 'Polygon',
      coordinates,
    };
  }

  return null;
}
