import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';
import { ModuleKeySchema, ScopeTypeSchema } from './enums';

export const FirstAssignmentInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  roleId: z.uuid(),
  module: ModuleKeySchema,
  scopeType: ScopeTypeSchema,
  scopeStateId: z.uuid().nullable().optional(),
  scopeOrgId: z.uuid().nullable().optional(),
  canCaptureOffline: z.boolean().default(false),
  validFromOn: z.iso.date().nullable().optional(),
  validToOn: z.iso.date().nullable().optional(),
});
export type FirstAssignmentInput = z.infer<typeof FirstAssignmentInputSchema>;

export const CreateAppUserInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  email: z.string().email(),
  username: z.string().min(3).max(50).optional(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
  isActive: z.boolean().default(true),
  firstAssignment: FirstAssignmentInputSchema.optional(),
});
export type CreateAppUserInput = z.infer<typeof CreateAppUserInputSchema>;

export const UpdateAppUserInputSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).nullable().optional(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAppUserInput = z.infer<typeof UpdateAppUserInputSchema>;

export const AppUserResponseSchema = StandardResponseColumnsSchema.extend({
  email: z.string().email(),
  username: z.string().nullable(),
  fullName: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean().default(false),
  failedSignIns: z.number().int().default(0),
  lockedUntil: z.iso.datetime().nullable(),
  lastSignInAt: z.iso.datetime().nullable(),
});
export type AppUserResponse = z.infer<typeof AppUserResponseSchema>;

export const ListAppUsersQuerySchema = BaseListQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
  roleId: z.uuid().optional(),
});
export type ListAppUsersQuery = z.infer<typeof ListAppUsersQuerySchema>;
