import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { SlisReviewableColumnsSchema, VolumeM3Schema } from './common';
import { RequestLevelSchema, WaterDecisionSchema } from './enums';

export const CreateWaterRequestInputSchema = z
  .object({
    id: z.string().uuid({ version: 'v7' }).optional(),
    schemeId: z.string().uuid(),
    level: RequestLevelSchema,
    wuaId: z.string().uuid().optional(),
    farmerId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    volumeM3: VolumeM3Schema.optional(),
    periodFromOn: z.iso.date().optional(),
    periodToOn: z.iso.date().optional(),
  })
  .refine(
    (data) => {
      if (data.level === 'individual') {
        return Boolean(data.farmerId && !data.wuaId);
      }
      return Boolean(data.wuaId && !data.farmerId);
    },
    {
      message:
        'Level "individual" requires farmerId without wuaId; other levels require wuaId without farmerId',
      path: ['farmerId'],
    },
  )
  .refine(
    (data) => {
      if (data.periodFromOn && data.periodToOn) {
        return data.periodFromOn <= data.periodToOn;
      }
      return true;
    },
    { message: 'periodFromOn must be before or equal to periodToOn', path: ['periodToOn'] },
  );
export type CreateWaterRequestInput = z.infer<typeof CreateWaterRequestInputSchema>;

export const DecideWaterRequestInputSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});
export type DecideWaterRequestInput = z.infer<typeof DecideWaterRequestInputSchema>;

export const WaterRequestResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  level: RequestLevelSchema,
  wuaId: z.string().uuid().nullable(),
  farmerId: z.string().uuid().nullable(),
  seasonId: z.string().uuid().nullable(),
  volumeM3: VolumeM3Schema.nullable(),
  periodFromOn: z.iso.date().nullable(),
  periodToOn: z.iso.date().nullable(),
  decision: WaterDecisionSchema,
});
export type WaterRequestResponse = z.infer<typeof WaterRequestResponseSchema>;

export const ListWaterRequestsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  level: RequestLevelSchema.optional(),
  wuaId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  decision: WaterDecisionSchema.optional(),
  status: RecordStatusSchema.optional(),
});
export type ListWaterRequestsQuery = z.infer<typeof ListWaterRequestsQuerySchema>;
