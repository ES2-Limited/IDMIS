import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';
import { ModuleKeySchema, ScopeTypeSchema } from './enums';

export const CreateAssignmentInputSchema = z
  .object({
    id: z.uuid({ version: 'v7' }).optional(),
    userId: z.uuid(),
    roleId: z.uuid(),
    module: ModuleKeySchema,
    scopeType: ScopeTypeSchema,
    scopeStateId: z.uuid().nullable().optional(),
    scopeOrgId: z.uuid().nullable().optional(),
    canCaptureOffline: z.boolean().default(false),
    validFromOn: z.iso.date().nullable().optional(),
    validToOn: z.iso.date().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.scopeType === 'national') {
        return !data.scopeStateId && !data.scopeOrgId;
      }
      if (data.scopeType === 'state') {
        return !!data.scopeStateId && !data.scopeOrgId;
      }
      if (['rbda', 'scheme', 'sector'].includes(data.scopeType)) {
        return !!data.scopeOrgId && !data.scopeStateId;
      }
      return false;
    },
    {
      message:
        'Scope mismatch: national requires no scope IDs, state requires scopeStateId only, and rbda/scheme/sector requires scopeOrgId only.',
      path: ['scopeType'],
    },
  )
  .refine(
    (data) => {
      if (data.validFromOn && data.validToOn) {
        return data.validFromOn <= data.validToOn;
      }
      return true;
    },
    {
      message: 'validFromOn must be before or equal to validToOn',
      path: ['validToOn'],
    },
  );
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInputSchema>;

export const UpdateAssignmentInputSchema = z
  .object({
    roleId: z.uuid().optional(),
    module: ModuleKeySchema.optional(),
    scopeType: ScopeTypeSchema.optional(),
    scopeStateId: z.uuid().nullable().optional(),
    scopeOrgId: z.uuid().nullable().optional(),
    canCaptureOffline: z.boolean().optional(),
    validFromOn: z.iso.date().nullable().optional(),
    validToOn: z.iso.date().nullable().optional(),
  })
  .refine(
    (data) => {
      if (!data.scopeType) return true;
      if (data.scopeType === 'national') {
        return !data.scopeStateId && !data.scopeOrgId;
      }
      if (data.scopeType === 'state') {
        return !!data.scopeStateId && !data.scopeOrgId;
      }
      if (['rbda', 'scheme', 'sector'].includes(data.scopeType)) {
        return !!data.scopeOrgId && !data.scopeStateId;
      }
      return false;
    },
    {
      message:
        'Scope mismatch: national requires no scope IDs, state requires scopeStateId only, and rbda/scheme/sector requires scopeOrgId only.',
      path: ['scopeType'],
    },
  )
  .refine(
    (data) => {
      if (data.validFromOn && data.validToOn) {
        return data.validFromOn <= data.validToOn;
      }
      return true;
    },
    {
      message: 'validFromOn must be before or equal to validToOn',
      path: ['validToOn'],
    },
  );
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentInputSchema>;

export const AssignmentResponseSchema = StandardResponseColumnsSchema.extend({
  userId: z.uuid(),
  roleId: z.uuid(),
  module: ModuleKeySchema,
  scopeType: ScopeTypeSchema,
  scopeStateId: z.uuid().nullable(),
  scopeOrgId: z.uuid().nullable(),
  canCaptureOffline: z.boolean(),
  validFromOn: z.iso.date().nullable(),
  validToOn: z.iso.date().nullable(),
});
export type AssignmentResponse = z.infer<typeof AssignmentResponseSchema>;

export const ListAssignmentsQuerySchema = BaseListQuerySchema.extend({
  userId: z.uuid().optional(),
  roleId: z.uuid().optional(),
  module: ModuleKeySchema.optional(),
  scopeType: ScopeTypeSchema.optional(),
});
export type ListAssignmentsQuery = z.infer<typeof ListAssignmentsQuerySchema>;
