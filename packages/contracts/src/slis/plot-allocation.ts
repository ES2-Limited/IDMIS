import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { SlisReviewableColumnsSchema } from './common';

const PlotAllocationBaseSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  plotId: z.string().uuid(),
  farmerId: z.string().uuid(),
  seasonId: z.string().uuid().optional(),
  tenureId: z.string().uuid().optional(),
  fromOn: z.iso.date().optional(),
  toOn: z.iso.date().optional(),
});

export const CreatePlotAllocationInputSchema = PlotAllocationBaseSchema.refine(
  (data) => {
    if (data.fromOn && data.toOn) {
      return data.fromOn <= data.toOn;
    }
    return true;
  },
  { message: 'fromOn must be before or equal to toOn', path: ['toOn'] },
);
export type CreatePlotAllocationInput = z.infer<typeof CreatePlotAllocationInputSchema>;

export const UpdatePlotAllocationInputSchema = PlotAllocationBaseSchema.omit({
  id: true,
  plotId: true,
  farmerId: true,
}).partial();
export type UpdatePlotAllocationInput = z.infer<typeof UpdatePlotAllocationInputSchema>;

export const PlotAllocationResponseSchema = SlisReviewableColumnsSchema.extend({
  plotId: z.string().uuid(),
  farmerId: z.string().uuid(),
  seasonId: z.string().uuid().nullable(),
  tenureId: z.string().uuid().nullable(),
  fromOn: z.iso.date().nullable(),
  toOn: z.iso.date().nullable(),
});
export type PlotAllocationResponse = z.infer<typeof PlotAllocationResponseSchema>;

export const ListPlotAllocationsQuerySchema = BaseListQuerySchema.extend({
  plotId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
});
export type ListPlotAllocationsQuery = z.infer<typeof ListPlotAllocationsQuerySchema>;
