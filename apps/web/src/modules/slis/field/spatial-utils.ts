import { area } from '@turf/area';
import { polygon } from '@turf/helpers';
import type { GeoJsonPolygon } from '@idmis/contracts';

/**
 * Calculates geodesic area in hectares for a closed ring of coordinates.
 * Coordinates are formatted as [longitude, latitude] per GeoJSON specification.
 */
export function calculatePolygonAreaHa(coords: Array<[number, number]>): number {
  if (coords.length < 3) return 0;

  // Ensure ring is closed (first coord === last coord)
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  if (ring.length < 4) return 0;

  try {
    const poly = polygon([ring]);
    const areaSqMeters = area(poly);
    // Convert m² to hectares (1 ha = 10,000 m²)
    const ha = areaSqMeters / 10000;
    return parseFloat(ha.toFixed(4));
  } catch (err) {
    console.warn('Area calculation error:', err);
    return 0;
  }
}

/**
 * Validates and converts array of boundary points into a valid GeoJsonPolygon.
 */
export function createGeoJsonPolygon(coords: Array<[number, number]>): GeoJsonPolygon | null {
  if (coords.length < 3) return null;

  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}
