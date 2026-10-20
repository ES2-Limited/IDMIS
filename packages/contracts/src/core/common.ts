import { z } from 'zod';

export const StandardResponseColumnsSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid().nullable().optional(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.uuid().nullable().optional(),
  deletedAt: z.iso.datetime().nullable().optional(),
});
export type StandardResponseColumns = z.infer<typeof StandardResponseColumnsSchema>;

export const BaseListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  sort: z.string().optional(),
});
export type BaseListQuery = z.infer<typeof BaseListQuerySchema>;
