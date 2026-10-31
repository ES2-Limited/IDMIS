import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from '../core/common';

const SeasonBaseSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

export const CreateSeasonInputSchema = SeasonBaseSchema.refine(
  (data) => data.startsOn <= data.endsOn,
  { message: 'startsOn must be before or equal to endsOn', path: ['endsOn'] },
);
export type CreateSeasonInput = z.infer<typeof CreateSeasonInputSchema>;

export const UpdateSeasonInputSchema = SeasonBaseSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdateSeasonInput = z.infer<typeof UpdateSeasonInputSchema>;

export const SeasonResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});
export type SeasonResponse = z.infer<typeof SeasonResponseSchema>;

export const ListSeasonsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
});
export type ListSeasonsQuery = z.infer<typeof ListSeasonsQuerySchema>;
