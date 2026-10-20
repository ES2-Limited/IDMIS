import { describe, it, expect } from 'vitest';
import * as schema from './schema';

describe('Database Schema', () => {
  it('exports schema object', () => {
    expect(schema).toBeDefined();
  });
});
