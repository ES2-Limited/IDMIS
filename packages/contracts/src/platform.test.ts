import { describe, it, expect } from 'vitest';
import {
  ProblemDetailsSchema,
  ValidationErrorItemSchema,
  ConflictProblemSchema,
  IdempotencyKeySchema,
  SampleEchoInputSchema,
  SampleEchoResponseSchema,
} from './platform';

describe('platform contracts', () => {
  describe('ProblemDetailsSchema (RFC 9457)', () => {
    it('validates a compliant problem details payload', () => {
      const problem = {
        type: '/errors/validation-failed',
        title: 'Validation Failed',
        status: 400,
        detail: 'The payload contains invalid fields',
        instance: '/api/v1/sample',
        code: 'VALIDATION_ERROR',
        requestId: 'req-12345',
        timestamp: new Date().toISOString(),
        errors: [{ field: 'message', message: 'Message must be at least 3 characters long' }],
      };

      const parsed = ProblemDetailsSchema.parse(problem);
      expect(parsed.status).toBe(400);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors?.[0]?.field).toBe('message');
    });

    it('validates a validation error item directly', () => {
      const item = ValidationErrorItemSchema.parse({
        field: 'email',
        message: 'Invalid email',
        code: 'invalid_string',
      });
      expect(item.field).toBe('email');
    });

    it('applies default type = about:blank when omitted', () => {
      const problem = {
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
      };

      const parsed = ProblemDetailsSchema.parse(problem);
      expect(parsed.type).toBe('about:blank');
    });
  });

  describe('ConflictProblemSchema (409 Conflict)', () => {
    it('validates a 409 conflict payload with current record and currentVersion', () => {
      const conflict = {
        type: '/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Record was modified concurrently by another user',
        instance: '/api/v1/users/018f3a5e-0000-7000-8000-000000000001',
        code: 'VERSION_CONFLICT',
        requestId: 'req-conf-1',
        timestamp: new Date().toISOString(),
        current: { id: '018f3a5e-0000-7000-8000-000000000001', fullName: 'Updated Name' },
        currentVersion: 3,
      };

      const parsed = ConflictProblemSchema.parse(conflict);
      expect(parsed.status).toBe(409);
      expect(parsed.currentVersion).toBe(3);
      expect(parsed.current).toEqual({
        id: '018f3a5e-0000-7000-8000-000000000001',
        fullName: 'Updated Name',
      });
    });

    it('rejects a non-409 status code', () => {
      expect(() =>
        ConflictProblemSchema.parse({
          title: 'Conflict',
          status: 400,
          detail: 'Wrong status',
          timestamp: new Date().toISOString(),
          current: {},
          currentVersion: 1,
        }),
      ).toThrow();
    });
  });

  describe('IdempotencyKeySchema', () => {
    it('accepts valid UUID idempotency key', () => {
      const validUuid = '018f3a5e-0000-7000-8000-000000000001';
      expect(IdempotencyKeySchema.parse(validUuid)).toBe(validUuid);
    });

    it('rejects non-UUID idempotency key', () => {
      expect(() => IdempotencyKeySchema.parse('not-a-uuid')).toThrow();
      expect(() => IdempotencyKeySchema.parse('')).toThrow();
    });
  });

  describe('SampleEchoInputSchema & SampleEchoResponseSchema', () => {
    it('accepts valid sample input', () => {
      const input = SampleEchoInputSchema.parse({
        message: 'Hello IDMIS',
        count: 3,
      });
      expect(input.message).toBe('Hello IDMIS');
      expect(input.count).toBe(3);
    });

    it('rejects short message or non-positive count', () => {
      expect(() =>
        SampleEchoInputSchema.parse({
          message: 'hi',
          count: 0,
        }),
      ).toThrow();
    });

    it('validates sample echo response', () => {
      const res = SampleEchoResponseSchema.parse({
        echoedMessage: 'Hello IDMIS',
        count: 3,
        processedAt: new Date().toISOString(),
      });
      expect(res.count).toBe(3);
    });
  });
});
