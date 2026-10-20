import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';

// --- State ---
export const StateResponseSchema = StandardResponseColumnsSchema.extend({
  code: z.string(),
  name: z.string(),
});
export type StateResponse = z.infer<typeof StateResponseSchema>;

export const ListStatesQuerySchema = BaseListQuerySchema;
export type ListStatesQuery = z.infer<typeof ListStatesQuerySchema>;

// --- LGA ---
export const LgaResponseSchema = z.object({
  id: z.uuid(),
  stateId: z.uuid(),
  code: z.string(),
  name: z.string(),
});
export type LgaResponse = z.infer<typeof LgaResponseSchema>;

export const ListLgasQuerySchema = BaseListQuerySchema.extend({
  stateId: z.uuid().optional(),
});
export type ListLgasQuery = z.infer<typeof ListLgasQuerySchema>;

// --- Ward ---
export const WardResponseSchema = z.object({
  id: z.uuid(),
  lgaId: z.uuid(),
  code: z.string(),
  name: z.string(),
});
export type WardResponse = z.infer<typeof WardResponseSchema>;

export const ListWardsQuerySchema = BaseListQuerySchema.extend({
  lgaId: z.uuid().optional(),
});
export type ListWardsQuery = z.infer<typeof ListWardsQuerySchema>;
