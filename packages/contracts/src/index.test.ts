import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { permissions } from './index';

describe('contracts package', () => {
  it('exports permissions', () => {
    expect(permissions).toBeDefined();
  });

  it('validates schemas with zod', () => {
    const TestSchema = z.object({
      id: z.string(),
      count: z.number(),
    });
    const parsed = TestSchema.parse({ id: 'test-1', count: 42 });
    expect(parsed).toEqual({ id: 'test-1', count: 42 });
  });
});
