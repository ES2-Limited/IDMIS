import { describe, it, expect } from 'vitest';
import { calculatePolygonAreaHa, createGeoJsonPolygon } from './spatial-utils';

describe('Plot Spatial Calculations & Boundary Walk (FE-2.4)', () => {
  it('calculates geodesic polygon area accurately within 2% margin', () => {
    // 100m x 100m approx square near Kano (11.8°N, 8.5°E) = ~1.00 hectare (10,000 m²)
    // 0.0009 degrees latitude is approx 100 meters
    // 0.00092 degrees longitude is approx 100 meters
    const testCoordinates: Array<[number, number]> = [
      [8.5, 11.8],
      [8.50092, 11.8],
      [8.50092, 11.8009],
      [8.5, 11.8009],
      [8.5, 11.8],
    ];

    const areaHa = calculatePolygonAreaHa(testCoordinates);

    // Expected ~ 1.0 ha
    expect(areaHa).toBeGreaterThan(0.95);
    expect(areaHa).toBeLessThan(1.05);

    // Margin error check <= 2% from target 1.0 ha
    const errorMargin = Math.abs(areaHa - 1.0);
    expect(errorMargin).toBeLessThanOrEqual(0.02);
  });

  it('correctly closes open polygon rings and builds compliant GeoJsonPolygon', () => {
    const unclosedCoords: Array<[number, number]> = [
      [8.51, 11.81],
      [8.52, 11.81],
      [8.52, 11.82],
    ];

    const poly = createGeoJsonPolygon(unclosedCoords);
    expect(poly).not.toBeNull();
    expect(poly?.type).toBe('Polygon');
    expect(poly?.coordinates[0]).toHaveLength(4); // auto-closed with 4 vertices
    expect(poly?.coordinates[0][0]).toEqual(poly?.coordinates[0][3]);
  });

  it('returns 0 ha and null polygon if fewer than 3 points provided', () => {
    expect(calculatePolygonAreaHa([[8.5, 11.8]])).toBe(0);
    expect(createGeoJsonPolygon([[8.5, 11.8]])).toBeNull();
  });
});
