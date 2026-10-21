import { describe, it, expect } from 'vitest';
import { RequestScopeSchema, RequestUserSchema, RequestContextSchema } from './request-context';

describe('RequestContext schemas', () => {
  it('validates a compliant RequestScope', () => {
    const scope = {
      isNational: false,
      stateIds: ['018f3a5e-0000-7000-8000-000000000001'],
      schemeIds: ['018f3a5e-0000-7000-8000-000000000002'],
      sectorIds: ['018f3a5e-0000-7000-8000-000000000003'],
    };

    const parsed = RequestScopeSchema.parse(scope);
    expect(parsed.isNational).toBe(false);
    expect(parsed.stateIds).toHaveLength(1);
    expect(parsed.schemeIds).toHaveLength(1);
    expect(parsed.sectorIds).toHaveLength(1);
  });

  it('validates a full RequestContext with user and permissions', () => {
    const user = {
      id: '018f3a5e-0000-7000-8000-000000000001',
      email: 'officer@triming.gov.ng',
      fullName: 'Ibrahim Musa',
      scope: {
        isNational: false,
        stateIds: ['018f3a5e-0000-7000-8000-000000000010'],
        schemeIds: ['018f3a5e-0000-7000-8000-000000000020'],
        sectorIds: [],
      },
      permissions: ['core.user.read', 'core.wua.read'],
    };

    const parsedUser = RequestUserSchema.parse(user);
    expect(parsedUser.email).toBe('officer@triming.gov.ng');

    const context = {
      requestId: 'req-018f3a5e-1111',
      user: parsedUser,
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    };

    const parsed = RequestContextSchema.parse(context);
    expect(parsed.requestId).toBe('req-018f3a5e-1111');
    expect(parsed.user?.permissions).toContain('core.wua.read');
  });
});
