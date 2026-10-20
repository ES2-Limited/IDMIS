import { describe, it, expect } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns health status', () => {
    const controller = new AppController();
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
