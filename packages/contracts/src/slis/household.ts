import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { SlisReviewableColumnsSchema } from './common';

export const CreateHouseholdInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  wardId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  settlement: z.string().max(100).optional(),
  size: z.number().int().min(1).max(100).optional(),
  males: z.number().int().min(0).max(100).optional(),
  females: z.number().int().min(0).max(100).optional(),
  children: z.number().int().min(0).max(100).optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdInputSchema>;

export const UpdateHouseholdInputSchema = CreateHouseholdInputSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdateHouseholdInput = z.infer<typeof UpdateHouseholdInputSchema>;

export const HouseholdResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  wardId: z.string().uuid().nullable(),
  name: z.string().nullable().optional(),
  settlement: z.string().nullable().optional(),
  size: z.number().int().nullable(),
  males: z.number().int().nullable(),
  females: z.number().int().nullable(),
  children: z.number().int().nullable(),
});
export type HouseholdResponse = z.infer<typeof HouseholdResponseSchema>;

export const ListHouseholdsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
});
export type ListHouseholdsQuery = z.infer<typeof ListHouseholdsQuerySchema>;
