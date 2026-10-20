import { z } from 'zod';
import { BaseListQuerySchema } from './common';

export const CreateRoleInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  key: z.string().min(1).max(50),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isSystem: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;

export const UpdateRoleInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;

export const RoleResponseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});
export type RoleResponse = z.infer<typeof RoleResponseSchema>;

export const ListRolesQuerySchema = BaseListQuerySchema;
export type ListRolesQuery = z.infer<typeof ListRolesQuerySchema>;

export const SetRolePermissionsInputSchema = z.object({
  roleId: z.uuid(),
  permissions: z.array(z.string()),
});
export type SetRolePermissionsInput = z.infer<typeof SetRolePermissionsInputSchema>;
