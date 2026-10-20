import { z } from 'zod';
import { BaseListQuerySchema } from './common';

export const SetSettingInputSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
});
export type SetSettingInput = z.infer<typeof SetSettingInputSchema>;

export const SettingResponseSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.uuid().nullable(),
});
export type SettingResponse = z.infer<typeof SettingResponseSchema>;

export const ListSettingsQuerySchema = BaseListQuerySchema;
export type ListSettingsQuery = z.infer<typeof ListSettingsQuerySchema>;
