import { describe, it, expect } from 'vitest';
import { calculateMeetsStandard } from './dam-safety.helper';

describe('calculateMeetsStandard', () => {
  it('returns true when dam_body and spillway_1 are present and all ratings are excellent, good, or fair', () => {
    const components = [
      { component: 'dam_body', ratingCode: 'good' },
      { component: 'spillway_1', ratingCode: 'excellent' },
      { component: 'inlet', ratingCode: 'fair' },
    ];
    expect(calculateMeetsStandard(components)).toBe(true);
  });

  it('returns false when spillway_1 is missing', () => {
    const components = [
      { component: 'dam_body', ratingCode: 'good' },
      { component: 'inlet', ratingCode: 'excellent' },
    ];
    expect(calculateMeetsStandard(components)).toBe(false);
  });

  it('returns false when dam_body is missing', () => {
    const components = [
      { component: 'spillway_1', ratingCode: 'good' },
      { component: 'spillway_2', ratingCode: 'excellent' },
    ];
    expect(calculateMeetsStandard(components)).toBe(false);
  });

  it('returns false when any component has rating poor', () => {
    const components = [
      { component: 'dam_body', ratingCode: 'good' },
      { component: 'spillway_1', ratingCode: 'poor' },
    ];
    expect(calculateMeetsStandard(components)).toBe(false);
  });

  it('returns false when any component has rating critical', () => {
    const components = [
      { component: 'dam_body', ratingCode: 'critical' },
      { component: 'spillway_1', ratingCode: 'good' },
    ];
    expect(calculateMeetsStandard(components)).toBe(false);
  });

  it('returns false for empty components', () => {
    expect(calculateMeetsStandard([])).toBe(false);
  });
});
