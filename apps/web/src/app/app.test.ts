import { describe, it, expect } from 'vitest';
import { queryClient } from './index';

describe('App', () => {
  it('initializes queryClient', () => {
    expect(queryClient).toBeDefined();
  });
});
