import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from '../core/common';
import { SlisGenderSchema } from './enums';

export const CreateTrainingInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  topic: z.string().min(1).max(255),
  tags: z.array(z.string().min(1)).default([]),
  heldOn: z.iso.date(),
  venue: z.string().max(255).optional(),
});
export type CreateTrainingInput = z.infer<typeof CreateTrainingInputSchema>;

export const UpdateTrainingInputSchema = CreateTrainingInputSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdateTrainingInput = z.infer<typeof UpdateTrainingInputSchema>;

export const TrainingResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  topic: z.string(),
  tags: z.array(z.string()),
  heldOn: z.iso.date(),
  venue: z.string().nullable(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type TrainingResponse = z.infer<typeof TrainingResponseSchema>;

export const ListTrainingsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  tag: z.string().optional(),
  fromHeldOn: z.iso.date().optional(),
  toHeldOn: z.iso.date().optional(),
});
export type ListTrainingsQuery = z.infer<typeof ListTrainingsQuerySchema>;

// --- Training Attendance ---
export const RecordTrainingAttendanceInputSchema = z
  .object({
    id: z.string().uuid({ version: 'v7' }).optional(),
    trainingId: z.string().uuid(),
    farmerId: z.string().uuid().optional(),
    staffName: z.string().min(1).max(100).optional(),
    gender: SlisGenderSchema.optional(),
  })
  .refine((data) => Boolean(data.farmerId) !== Boolean(data.staffName), {
    message: 'Exactly one of farmerId or staffName must be provided',
    path: ['staffName'],
  });
export type RecordTrainingAttendanceInput = z.infer<typeof RecordTrainingAttendanceInputSchema>;

export const TrainingAttendanceResponseSchema = z.object({
  id: z.string().uuid(),
  trainingId: z.string().uuid(),
  farmerId: z.string().uuid().nullable(),
  staffName: z.string().nullable(),
  gender: SlisGenderSchema.nullable(),
});
export type TrainingAttendanceResponse = z.infer<typeof TrainingAttendanceResponseSchema>;

export const ListTrainingAttendanceQuerySchema = BaseListQuerySchema.extend({
  trainingId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
});
export type ListTrainingAttendanceQuery = z.infer<typeof ListTrainingAttendanceQuerySchema>;
